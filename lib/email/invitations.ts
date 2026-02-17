import { getResendClient, getResendFromEmail } from '@/lib/email/resend'

interface SendInvitationEmailParams {
  toEmail: string
  companyName: string
  inviteUrl: string
  expiresAt: string
}

interface SendMemberRemovedEmailParams {
  toEmail: string
  companyName: string
}

function buildInvitationCopy() {
  return {
    subjectPrefix: 'Invitation to join',
    heading: 'You are invited to join',
    intro: 'Create your account to join your team workspace in Summit.',
    ctaLabel: 'Create account and continue',
  }
}

function buildInvitationHtml({
  companyName,
  inviteUrl,
  expiresAt,
}: Omit<SendInvitationEmailParams, 'toEmail'>) {
  const copy = buildInvitationCopy()

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin-bottom: 12px;">${copy.heading} ${companyName} on Summit</h2>
      <p style="margin-bottom: 16px;">
        An owner from <strong>${companyName}</strong> invited you to collaborate in Summit. ${copy.intro}
      </p>
      <p style="margin-bottom: 20px;">
        <a href="${inviteUrl}" style="display: inline-block; padding: 10px 16px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 6px;">
          ${copy.ctaLabel}
        </a>
      </p>
      <p style="font-size: 14px; color: #6b7280;">
        This invitation expires on ${new Date(expiresAt).toLocaleString()}.
      </p>
      <p style="font-size: 14px; color: #6b7280;">
        If you did not expect this invitation, you can ignore this email.
      </p>
    </div>
  `
}

export async function sendInvitationEmail({
  toEmail,
  companyName,
  inviteUrl,
  expiresAt,
}: SendInvitationEmailParams) {
  try {
    const resend = getResendClient()
    const from = getResendFromEmail()
    const copy = buildInvitationCopy()

    const { error } = await resend.emails.send({
      from,
      to: toEmail,
      subject: `${copy.subjectPrefix} ${companyName} on Summit`,
      html: buildInvitationHtml({ companyName, inviteUrl, expiresAt }),
      text: [
        `${copy.heading} ${companyName} on Summit.`,
        `${copy.intro}`,
        `Continue: ${inviteUrl}`,
        `This invitation expires on ${new Date(expiresAt).toLocaleString()}.`,
      ].join('\n'),
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true as const }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send invitation email',
    }
  }
}

export async function sendMemberRemovedEmail({
  toEmail,
  companyName,
}: SendMemberRemovedEmailParams) {
  try {
    const resend = getResendClient()
    const from = getResendFromEmail()

    const { error } = await resend.emails.send({
      from,
      to: toEmail,
      subject: `Access removed from ${companyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
          <h2 style="margin-bottom: 12px;">Your access was removed from ${companyName}</h2>
          <p style="margin-bottom: 16px;">
            Your member access to <strong>${companyName}</strong> has been removed.
          </p>
          <p style="font-size: 14px; color: #6b7280;">
            If this was unexpected, contact a workspace owner.
          </p>
        </div>
      `,
      text: [
        `Your access to ${companyName} has been removed.`,
        'If this was unexpected, contact a workspace owner.',
      ].join('\n'),
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true as const }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send removal email',
    }
  }
}
