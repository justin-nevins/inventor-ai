import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { Resend } from "npm:resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
const hookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  try {
    const payload = await req.text();
    const headers = Object.fromEntries(req.headers);
    const wh = new Webhook(hookSecret);
    const { user, email_data } = wh.verify(payload, headers) as {
      user: { email: string };
      email_data: {
        token: string;
        token_hash: string;
        redirect_to: string;
        email_action_type: string;
        site_url: string;
        token_new: string;
        token_hash_new: string;
      };
    };

    const { email_action_type, site_url, token_hash, redirect_to } =
      email_data;

    // Build confirmation URL
    const confirmUrl = new URL("/auth/callback", site_url);
    confirmUrl.searchParams.set("token_hash", token_hash);
    confirmUrl.searchParams.set("type", email_action_type);
    if (redirect_to) confirmUrl.searchParams.set("next", redirect_to);

    // Subject + body by action type
    let subject: string;
    let html: string;
    switch (email_action_type) {
      case "signup":
        subject = "Confirm your InventorAI account";
        html = `<h2>Welcome to InventorAI!</h2>
        <p>Click below to confirm your account:</p>
        <p><a href="${confirmUrl}">Confirm Email</a></p>`;
        break;
      case "email_change":
        subject = "Confirm your email change";
        html = `<h2>Email Change Request</h2>
        <p>Click below to confirm your new email:</p>
        <p><a href="${confirmUrl}">Confirm Email Change</a></p>`;
        break;
      case "recovery":
        subject = "Reset your password";
        html = `<h2>Password Reset</h2>
        <p>Click below to reset your password:</p>
        <p><a href="${confirmUrl}">Reset Password</a></p>`;
        break;
      default:
        subject = "InventorAI Notification";
        html = `<p><a href="${confirmUrl}">Click here</a></p>`;
    }

    const { error } = await resend.emails.send({
      from: "InventorAI <noreply@myinventorai.com>",
      to: [user.email],
      subject,
      html,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
