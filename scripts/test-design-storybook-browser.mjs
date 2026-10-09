import {createRequire} from 'node:module';
const require=createRequire(new URL('../apps/dashboard/package.json',import.meta.url));
const {chromium,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:60000});
const base='http://127.0.0.1:6006';
const index=await (await fetch(base+'/index.json')).json();
const stories=Object.values(index.entries).filter(s=>s.importPath.endsWith('design-system.stories.tsx')&&s.type==='story');
if(stories.length!==2)throw Error('Missing foundation light/dark stories');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const story of stories)for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  await page.goto(base+'/iframe.html?id='+encodeURIComponent(story.id)+'&viewMode=story',{waitUntil:'networkidle',timeout:90000});
  try{await expect(page.getByRole('heading',{name:'المكونات الأساسية',exact:true})).toBeVisible();}
  catch(error){console.error((await page.locator('body').innerText()).slice(0,3000));console.error(errors);throw error;}
  await page.evaluate(()=>document.fonts.ready);
  const fontLoaded=await page.evaluate(()=>[...document.fonts].some(f=>f.status==='loaded'&&f.family.includes('IBM')));
  await page.screenshot({path:`/tmp/qarar-storybook-${story.exportName}-${width}.png`,fullPage:true});
  if(!fontLoaded)throw Error('Storybook does not load the local IBM font');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Storybook overflow '+width);
  await page.getByRole('radio',{name:'وحدة',exact:true}).click();
  await expect(page.getByRole('radio',{name:'وحدة',exact:true})).toBeChecked();
 }
 if(errors.length)throw Error(errors.join('\n'));
 console.log(JSON.stringify({ok:true,stories:stories.length,widths:[1440,390]}));
}finally{await browser.close();}
