import { createClient } from "@supabase/supabase-js"
import nodemailer from "nodemailer"
import { createIamAdminHandler } from "./handler.ts"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const mailer = nodemailer.createTransport({
  host: Deno.env.get("SMTP_HOST") ?? "mail",
  port: Number(Deno.env.get("SMTP_PORT") ?? "1025"),
  secure: false,
  auth: Deno.env.get("SMTP_USER")
    ? { user: Deno.env.get("SMTP_USER"), pass: Deno.env.get("SMTP_PASS") }
    : undefined,
})

const handler = createIamAdminHandler({
  createCaller: (authorization) => createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  admin,
  sendEmail: async (message) => {
    await mailer.sendMail({ from: Deno.env.get("SMTP_FROM") ?? "Qarar <noreply@qarar.local>", ...message })
  },
})

Deno.serve(handler)
