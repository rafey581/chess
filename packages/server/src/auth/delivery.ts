import nodemailer from 'nodemailer'
import { config, isEmailDeliveryConfigured } from '../config.js'
import type { OtpPurpose } from './otp.js'

/**
 * Delivering an OTP over email.
 *
 * SMTP has a real path and a dev path. When SMTP is not configured the code is written
 * to the server log instead of sent, so a fresh checkout can register and sign in with
 * no third-party account - and never with a silent failure, because the log line says
 * exactly that no message went out.
 *
 * Delivery failures are surfaced, not swallowed: the caller must not tell the player
 * "code sent" when the send threw.
 */

export interface DeliveryLog {
  info: (fields: Record<string, unknown>, message: string) => void
  warn: (fields: Record<string, unknown>, message: string) => void
}

const consoleLog: DeliveryLog = {
  info: (fields, message) => console.info(message, fields),
  warn: (fields, message) => console.warn(message, fields)
}

function minutesLeft(): number {
  return Math.max(1, Math.round(config.OTP_TTL_SEC / 60))
}

function subjectFor(purpose: OtpPurpose): string {
  return purpose === 'SIGNUP' ? 'Your Chess Arena verification code' : 'Your Chess Arena password reset code'
}

function bodyFor(code: string, purpose: OtpPurpose): string {
  const lead =
    purpose === 'SIGNUP'
      ? 'Use this code to finish creating your Chess Arena account'
      : 'Use this code to reset your Chess Arena password'
  return `${lead}: ${code}\n\nIt expires in ${minutesLeft()} minute(s). If you did not request this, you can ignore this message.`
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null | undefined

/**
 * Lazily builds the SMTP transport.
 *
 * `undefined` means "not yet decided", `null` means "no SMTP configured". Building it on
 * first use keeps a fresh checkout from opening a connection it will never use.
 */
function mailer(): ReturnType<typeof nodemailer.createTransport> | null {
  if (transporter === undefined) {
    transporter = isEmailDeliveryConfigured()
      ? nodemailer.createTransport({
          host: config.SMTP_HOST,
          port: config.SMTP_PORT,
          secure: config.SMTP_SECURE ?? false,
          auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined
        })
      : null
  }
  return transporter ?? null
}

async function sendEmail(to: string, code: string, purpose: OtpPurpose, log: DeliveryLog): Promise<void> {
  const transport = mailer()
  const text = bodyFor(code, purpose)
  if (!transport) {
    log.warn(
      { to, dev: true },
      `SMTP is not configured - OTP code for ${to} is ${code} (dev only, nothing was emailed)`
    )
    return
  }
  await transport.sendMail({
    from: config.SMTP_FROM,
    to,
    subject: subjectFor(purpose),
    text
  })
}

export async function sendOtpCode(opts: {
  identifier: string
  code: string
  purpose: OtpPurpose
  log?: DeliveryLog
}): Promise<void> {
  await sendEmail(opts.identifier, opts.code, opts.purpose, opts.log ?? consoleLog)
}
