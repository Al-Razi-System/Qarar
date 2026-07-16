import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    const { meeting_id } = await req.json()
    if (!meeting_id) {
      return new Response(JSON.stringify({ error: 'meeting_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Initialize Supabase Client with the user's auth token
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // 1. Fetch Meeting Details
    const { data: meeting, error: meetingError } = await supabaseClient
      .from('meetings')
      .select('*, governance_units(name_ar)')
      .eq('id', meeting_id)
      .single()

    if (meetingError || !meeting) {
      throw new Error('Meeting not found or you do not have permission to view it.')
    }

    // 2. Fetch Attendance
    const { data: attendance } = await supabaseClient
      .from('attendance_records')
      .select('attendance_status, users(full_name_ar)')
      .eq('meeting_id', meeting_id)

    // 3. Fetch Agenda Items and related Decisions
    const { data: agenda } = await supabaseClient
      .from('agenda_items')
      .select('title_ar, description, topics(title_ar), decisions(decision_text)')
      .eq('meeting_id', meeting_id)
      .order('order_index')

    // 4. Construct Prompt
    let prompt = `أنت خبير قانوني ومقرر جلسات. المطلوب كتابة مسودة "محضر اجتماع" رسمية باللغة العربية بناءً على البيانات التالية:\n\n`
    prompt += `اسم الاجتماع: ${meeting.title_ar}\n`
    prompt += `تاريخ الاجتماع: ${meeting.scheduled_date}\n`
    prompt += `الجهة/المجلس: ${meeting.governance_units?.name_ar || 'غير محدد'}\n\n`
    
    prompt += `الحضور:\n`
    attendance?.forEach(a => {
      prompt += `- ${a.users?.full_name_ar} (الحالة: ${a.attendance_status})\n`
    })
    
    prompt += `\nجدول الأعمال والقرارات المتخذة:\n`
    agenda?.forEach((item, index) => {
      prompt += `${index + 1}. ${item.title_ar}\n`
      if (item.topics?.title_ar) prompt += `   الموضوع: ${item.topics.title_ar}\n`
      if (item.decisions && item.decisions.length > 0) {
        prompt += `   القرارات المتخذة:\n`
        item.decisions.forEach((d: any) => {
          prompt += `   - ${d.decision_text}\n`
        })
      } else {
        prompt += `   القرارات المتخذة: لم تسجل قرارات.\n`
      }
    })

    prompt += `\nيرجى كتابة محضر رسمي مرتب يحتوي على: المقدمة، استعراض الحضور، سرد تفاصيل جدول الأعمال والقرارات، وخاتمة الاجتماع. لا تضف أي قرارات أو أحداث لم تذكر في البيانات أعلاه.`

    // 5. Call Gemini API
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not configured')
    }

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    })

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('Gemini API Error:', errText)
      throw new Error('Failed to generate content from AI provider')
    }

    const geminiData = await geminiRes.json()
    const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text

    if (!generatedText) {
      throw new Error('Empty response from AI provider')
    }

    // 6. Update meeting_minutes table
    const { data: existingMinute } = await supabaseClient
      .from('meeting_minutes')
      .select('id')
      .eq('meeting_id', meeting_id)
      .maybeSingle()

    let dbError;
    if (existingMinute) {
      const res = await supabaseClient
        .from('meeting_minutes')
        .update({
          content_draft: generatedText,
          generated_by_ai: true,
          status: 'generated'
        })
        .eq('id', existingMinute.id)
      dbError = res.error
    } else {
      const { data: userData } = await supabaseClient.auth.getUser()
      const res = await supabaseClient
        .from('meeting_minutes')
        .insert({
          meeting_id: meeting_id,
          organization_id: meeting.organization_id,
          content_draft: generatedText,
          generated_by_ai: true,
          status: 'generated',
          created_by_user_id: userData.user?.id
        })
      dbError = res.error
    }

    if (dbError) {
      throw new Error('Failed to save generated minutes to database: ' + dbError.message)
    }

    return new Response(JSON.stringify({ success: true, message: 'Minutes generated successfully' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('Error in generate-minutes:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
