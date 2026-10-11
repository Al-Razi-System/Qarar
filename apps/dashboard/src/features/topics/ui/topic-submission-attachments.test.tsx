import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {TopicSubmissionAttachments} from "./topic-submission-attachments";
afterEach(()=>vi.unstubAllGlobals());
function choose(){fireEvent.change(screen.getByLabelText("اختيار مرفق"),{target:{files:[new File(["document"],"evidence.pdf",{type:"application/pdf"})]}});}
it("uploads to the created topic and advances the session count",async()=>{
  const fetchMock=vi.fn().mockResolvedValue(Response.json({data:{attachment:"attachment-id"}}));vi.stubGlobal("fetch",fetchMock);
  render(<TopicSubmissionAttachments topicId="topic-id" required={2}/>);choose();fireEvent.click(screen.getByRole("button",{name:"رفع المرفق"}));
  await screen.findByText("تم رفع المرفق وحفظه للموضوع.");expect(screen.getByText(/تم رفع 1 من 2/)).toBeVisible();
  expect((fetchMock.mock.calls[0][1].body as FormData).get("topicId")).toBe("topic-id");
  expect(screen.getByRole("button",{name:"رفع المرفق"})).toBeDisabled();
});
it("blocks a second upload after an uncertain server failure and links to verification",async()=>{
  const fetchMock=vi.fn().mockResolvedValue(Response.json({error:{message:"تعذر الحفظ"}},{status:503}));vi.stubGlobal("fetch",fetchMock);
  render(<TopicSubmissionAttachments topicId="topic-id" required={2}/>);choose();fireEvent.click(screen.getByRole("button",{name:"رفع المرفق"}));
  await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("تعذر الحفظ"));expect(screen.getByRole("button",{name:"رفع المرفق"})).toBeDisabled();
  expect(screen.getByRole("link",{name:"فتح التفاصيل للتحقق من المرفقات"})).toHaveAttribute("href","/admin/topics/topic-id");
});
