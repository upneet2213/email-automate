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
        html: `<div
  style="
    font-family: Arial, sans-serif;
    font-size: 16px;
    color: #333;
    line-height: 1.6;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  "
>
  <p>Thank you for joining my painting workshop.</p>

  <p>
Workshop access — Telegram
    <a href="https://t.me/+1a2b3c4d5e6f7g8h9i"
      >https://t.me/+1a2b3c4d5e6f7g8h9i</a
    >
  </p>
  <p>
Live session (day of workshop)
    <a href="https://zoom.us/j/1234567890">https://zoom.us/j/1234567890</a>
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
