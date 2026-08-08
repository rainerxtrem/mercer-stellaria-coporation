import * as React from "react";
import { render } from "@react-email/render";

import { EmailChangeEmail } from "@/lib/email-templates/email-change";
import { InviteEmail } from "@/lib/email-templates/invite";
import { MagicLinkEmail } from "@/lib/email-templates/magic-link";
import { RecoveryEmail } from "@/lib/email-templates/recovery";
import { SignupEmail } from "@/lib/email-templates/signup";
import { publicSiteUrl } from "./mailer";

export type AuthEmailType = "signup" | "invite" | "recovery" | "magiclink" | "email_change";

const SITE_NAME = process.env.SITE_NAME ?? "Mercer & Stellaria Corporation";

const SUBJECTS: Record<AuthEmailType, string> = {
  signup: "Confirmez votre adresse e-mail",
  invite: "Vous avez été invité",
  recovery: "Réinitialisation de votre mot de passe",
  magiclink: "Votre lien de connexion",
  email_change: "Confirmez votre nouvelle adresse e-mail",
};

function element(type: AuthEmailType, params: { link: string; email: string }) {
  const siteUrl = publicSiteUrl();
  switch (type) {
    case "signup":
      return React.createElement(SignupEmail, {
        siteName: SITE_NAME,
        siteUrl,
        recipient: params.email,
        confirmationUrl: params.link,
      });
    case "invite":
      return React.createElement(InviteEmail, {
        siteName: SITE_NAME,
        siteUrl,
        confirmationUrl: params.link,
      });
    case "magiclink":
      return React.createElement(MagicLinkEmail, {
        siteName: SITE_NAME,
        confirmationUrl: params.link,
      });
    case "email_change":
      return React.createElement(EmailChangeEmail, {
        siteName: SITE_NAME,
        oldEmail: params.email,
        email: params.email,
        newEmail: params.email,
        confirmationUrl: params.link,
      });
    case "recovery":
    default:
      return React.createElement(RecoveryEmail, {
        siteName: SITE_NAME,
        confirmationUrl: params.link,
      });
  }
}

export async function renderAuthEmail(
  type: AuthEmailType,
  params: { link: string; email: string },
): Promise<{ subject: string; html: string; text: string }> {
  const node = element(type, params);
  const [html, text] = await Promise.all([render(node), render(node, { plainText: true })]);
  return { subject: SUBJECTS[type], html, text };
}
