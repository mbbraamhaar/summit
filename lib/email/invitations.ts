import { getResendClient, getResendFromEmail } from '@/lib/email/resend'

interface SendInvitationEmailParams {
  toEmail: string
  companyName: string
  inviteUrl: string
  expiresAt: string
}

function buildInvitationHtml({ companyName, inviteUrl, expiresAt }: Omit<SendInvitationEmailParams, 'toEmail'>) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin-bottom: 12px;">You are invited to join ${companyName} on Summit</h2>
      <p style="margin-bottom: 16px;">
        An owner from <strong>${companyName}</strong> invited you to collaborate in Summit.
      </p>
      <p style="margin-bottom: 20px;">
        <a href="${inviteUrl}" style="display: inline-block; padding: 10px 16px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 6px;">
          Accept invitation
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

    const { error } = await resend.emails.send({
      from,
      to: toEmail,
      subject: `Invitation to join ${companyName} on Summit`,
      html: buildInvitationHtml({ companyName, inviteUrl, expiresAt }),
      text: [
        `You are invited to join ${companyName} on Summit.`,
        `Accept invitation: ${inviteUrl}`,
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
