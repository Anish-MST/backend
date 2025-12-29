export const HTML_SIGNATURE = `
  <div style="margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px; font-family: Arial, sans-serif;">
    <p style="margin: 0; font-size: 15px; color: #333;">Thanks & regards,</p>
    <p style="margin: 5px 0 0 0; font-size: 16px; font-weight: bold; color: #1A73E8;">Day1AI</p>
    <p style="margin: 2px 0 0 0; font-size: 13px; color: #666;">
      A Mainstreamtek Agentic AI initiative | 
      <span style="color: #1A73E8;">Designed to think. Built to act.</span>
    </p>
  </div>
`;

export const TEXT_SIGNATURE = `\n\nThanks & regards,\nDay1AI\nA Mainstreamtek Agentic AI initiative | Designed to think. Built to act.`;

export function buildProvisionalOfferEmail(candidate) {
  const ctc = Number(candidate.salary || 0);
  const fixedCtc = ctc / 12;
  const employerPf = 1950;
  const monthlyFixedGross = fixedCtc - employerPf;
  const basic = monthlyFixedGross * 0.5;
  const hra = basic * 0.4;
  const specialAllowance = basic * 0.6;
  const grossSalary = basic + hra + specialAllowance;
  const employeePf = 1800;
  const professionalTax = 200;
  const incomeTax = ctc > 1200000 ? Math.round(fixedCtc * 0.05) : 0;
  const totalDeductions = employeePf + professionalTax + incomeTax;
  const estimatedTakeHome = grossSalary - totalDeductions;

  const fmt = (num) => Number(num).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function formatDOJ(dateString) {
    if (!dateString) return "To Be Confirmed";
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleString("en-GB", { month: "long" });
    const year = date.getFullYear();
    const suffix = (d) => {
      if (d > 3 && d < 21) return "th";
      switch (d % 10) {
        case 1: return "st"; case 2: return "nd"; case 3: return "rd"; default: return "th";
      }
    };
    return `${day}${suffix(day)} ${month} ${year}`;
  }

  return `
  <html>
  <body style="font-family: Arial, sans-serif; background:#f7f9fb; padding: 20px; color:#333;">
    <div style="max-width: 700px; margin: auto; background:#fff; padding: 30px; border-radius:10px; box-shadow:0 4px 15px rgba(0,0,0,0.08);">
      <h2 style="color:#1A73E8; margin-bottom: 10px;">Dear ${candidate.name},</h2>
      <p style="font-size:15px; line-height:1.6;">We are pleased to share your <strong>Provisional Offer</strong>. Kindly review the details below.</p>

      <div style="background:#F1F8FF; padding:15px 20px; border-left:4px solid #1A73E8; margin:20px 0; border-radius:5px;">
        <p style="margin:6px 0;"><strong>Designation:</strong> ${candidate.role || "Not Specified"}</p>
        <p style="margin:6px 0;"><strong>Date of Joining:</strong> ${formatDOJ(candidate.dateOfJoining)}</p>
        <p style="margin:6px 0;"><strong>Annual CTC:</strong> ₹${fmt(ctc)}</p>
      </div>

      <h3 style="color:#1A73E8; margin-top:30px;">Monthly Salary Structure</h3>
      <table style="width:100%; border-collapse:collapse; margin-bottom:25px;">
        <tr style="background:#E8F3FF;">
          <th style="padding:10px; text-align:left;">Component</th>
          <th style="padding:10px; text-align:right;">Amount (₹)</th>
        </tr>
        <tr><td style="padding:10px;">Fixed CTC (Monthly)</td><td style="padding:10px; text-align:right;">${fmt(fixedCtc)}</td></tr>
        <tr><td style="padding:10px;">Gross Salary</td><td style="padding:10px; text-align:right;">${fmt(monthlyFixedGross)}</td></tr>
        <tr><td style="padding:10px;">Employer PF</td><td style="padding:10px; text-align:right;">${fmt(employerPf)}</td></tr>
      </table>

      <h3 style="color:#1A73E8;">Estimated Take-Home</h3>
      <div style="background:#E9F7EF; padding:15px; border-radius:6px; border-left:4px solid #28A745;">
        <p style="font-size:20px; margin:0; font-weight:bold; color:#28A745;">₹${fmt(estimatedTakeHome)}</p>
      </div>

      <div style="background:#fff3cd; padding:20px; border:1px solid #ffeeba; margin-top:30px; border-radius: 5px; color:#856404;">
        <h3 style="margin-top:0;">⚠️ Action Required: Acceptance</h3>
        <p>To accept this offer, please <strong>reply</strong> with these details:</p>
        <pre style="background:#fff; padding:10px; border:1px solid #ddd; font-family: monospace;">Name:\nLocation:\nAddress:\nDate of Joining:\nNotice period:</pre>
      </div>

      <p style="margin-top:25px; font-size:13px; color:#777;">Note: This is a provisional offer and not a formal contract.</p>
      
      <!-- SIGNATURE INSIDE THE BOX -->
      ${HTML_SIGNATURE}
    </div>
  </body>
  </html>
  `;
}