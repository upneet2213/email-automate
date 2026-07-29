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
    const paymentId = payment.id;
    const email = payment.email;

    try {
      // TODO: idempotency check goes here (see step 5)
      await resend.emails.send({
        from: "harshita.art98@gmail.com",
        to: email,
        subject: "Payment received!",
        html: `<p>Thanks for your payment. Payment ID: ${paymentId}</p>`,
      });
    } catch (err) {
      console.error("Email send failed:", err);
      // still return 200 so Razorpay doesn't endlessly retry —
      // log this and handle failed sends separately (see note below)
    }
  }

  res.status(200).send("OK");
}
