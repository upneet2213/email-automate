import crypto from "crypto";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Vercel serverless functions parse JSON body by default —
// we need the RAW body to verify the Razorpay signature correctly.
export const config = {
  api: {
    bodyParser: false,
  },
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const rawBody = await getRawBody(req);
  const signature = req.headers["x-razorpay-signature"];
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  if (expectedSignature !== signature) {
    console.error("Invalid webhook signature");
    return res.status(400).send("Invalid signature");
  }

  const payload = JSON.parse(rawBody);

  if (payload.event === "payment.captured") {
    const payment = payload.payload.payment.entity;
    const paymentPageId = payment.notes?.payment_page_id; // check this too

    if ((!"art_proficiency_level") in payment.notes) {
      return res.status(200).send("Ignored - not our page");
    }
    const paymentId = payment.id;
    const email = payment.email;

    try {
      // TODO: idempotency check goes here (see step 5)
      await resend.emails.send({
        from: "Brushes by Harshita <payments@brushesbyharshita.com>",
        to: email,
        subject: "You are registered!",
        html: `<div style="font-family: Arial, sans-serif; font-size: 16px; color: #333; line-height: 1.6;">
  <p>Thank you for joining my painting workshop.</p>

  <p>Join my private Telegram group for updates and announcements using this link:</p>

  <p>
    
      href="https://t.me/+1a2b3c4d5e6f7g8h9i"
      style="background-color:#4caf50; border:none; color:#ffffff; padding:10px 20px; text-align:center; text-decoration:none; display:inline-block; font-size:16px; border-radius:4px;"
    >
      Join Telegram Group
    </a>
  </p>

  <p>On the day of the workshop, you can join the live session using this button:</p>

  <p>
    
      href="https://zoom.us/j/1234567890"
      style="background-color:#4caf50; border:none; color:#ffffff; padding:10px 20px; text-align:center; text-decoration:none; display:inline-block; font-size:16px; border-radius:4px;"
    >
      Join Zoom Session
    </a>
  </p>
</div>
`,
      });
    } catch (err) {
      console.error("Email send failed:", err);
      // still return 200 so Razorpay doesn't endlessly retry —
      // log this and handle failed sends separately (see note below)
    }
  }

  res.status(200).send("OK");
}
