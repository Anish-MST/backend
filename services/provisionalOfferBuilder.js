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
      switch (d % 10) { case 1: return "st"; case 2: return "nd"; case 3: return "rd"; default: return "th"; }
    };
    return `${day}${suffix(day)} ${month} ${year}`;
  }

  // INCENTIVE SECTION
  const incentiveHtml = candidate.hasSpecialIncentive ? `
    <div style="background:#FFF9C4; padding:15px; border-left:4px solid #FBC02D; margin:20px 0; border-radius:5px; border: 1px solid #FBC02D;">
      <p style="margin:0; font-weight:bold; color:#827717; font-size:14px; text-transform: uppercase;">Special Incentive Offered</p>
      <p style="margin:8px 0 0 0; color:#333; font-size:16px;">
        <b>Amount:</b> ₹${fmt(candidate.specialIncentiveAmount)}<br>
        <b>Type:</b> ${candidate.specialIncentiveDetail}
      </p>
      <p style="margin:8px 0 0 0; font-size: 12px; color: #827717; font-style: italic;">
        *Note: This incentive is separate from the Annual CTC calculations shown above.
      </p>
    </div>
  ` : "";

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

      ${incentiveHtml}

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
      ${HTML_SIGNATURE}
    </div>
  </body>
  </html>
  `;
}

export function buildHRNotificationHtml(candidate) {
  return `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px;">
      <h2 style="color: #1A73E8;">Action Required: Upload NDA Documents</h2>
      <p>Hi Jamuna,</p>
      <p>The candidate <b>${candidate.name}</b> has accepted the provisional offer for <b>${candidate.role || 'Software Engineer'}</b>.</p>
      
      <div style="background: #f1f8ff; padding: 20px; border-radius: 8px; border-left: 4px solid #1A73E8; margin: 20px 0;">
        <p style="margin: 0;"><strong>Next Step:</strong> Please upload the following files to the candidate's folder:</p>
        <ul style="margin-top: 10px;">
          <li><b>Unsigned NDA:</b> The blank template for the candidate to sign.</li>
          <li><b>Sample NDA:</b> A reference PDF showing correctly placed signatures.</li>
        </ul>
        <p style="margin: 10px 0 0 0;">The system will automatically notify the candidate once files are detected.</p>
      </div>

      <div style="text-align: center; margin-top: 25px;">
        <a href="${candidate.driveFolderWebViewLink}" 
           style="background: #1A73E8; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
           Open Candidate Drive Folder
        </a>
      </div>
      ${HTML_SIGNATURE}
    </div>
  `;
}

export function buildCandidateDashboardHtml(candidate, docStatus) {
  const rows = Object.values(docStatus).map(doc => {
    let statusText = doc.verified ? "Approved" : doc.uploaded ? "Uploaded" : "Missing";
    let color = statusText === "Approved" ? "#059669" : statusText === "Uploaded" ? "#2563eb" : "#dc2626";
    return `
      <tr>
        <td style="padding:12px; border-bottom:1px solid #eee; color: #555;">${doc.name}</td>
        <td style="padding:12px; border-bottom:1px solid #eee; text-align:right; color:${color}; font-weight:bold;">
          ${statusText}
        </td>
      </tr>`;
  }).join("");

  return `
    <div style="font-family: Arial, sans-serif; background: #f7f9fb; padding: 20px;">
      <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 30px; border-radius: 10px; border: 1px solid #eee; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">

        <h2 style="color: #1A73E8; margin-top: 0;">Document Submission</h2>

        <p>Dear ${candidate.name},</p>

        <p>
          We have provided an <b>Unsigned NDA</b> and a <b>Sample NDA</b> in your secure folder. 
          Please review the sample carefully before signing.
        </p>
        
        <ul style="color: #555; line-height: 1.6;">
          <li>Open the <b>Sample NDA</b> to see how and where to sign.</li>
          <li>Sign the <b>Unsigned NDA</b> exactly like the sample.</li>
          <li>Scan and save it <b>only</b> as a PDF file.</li>
          <li style="color: #d97706; font-weight: bold;">
            ⚠️ Requirement: The file must be named <b>"Signed NDA.pdf"</b>.
          </li>
        </ul>

        <div style="margin: 20px 0; background: #f8fafc; padding: 15px; border-left: 4px solid #1A73E8;">
          <p style="margin: 0; color: #444; font-weight: bold;">Guidelines:</p>
          <ul style="margin: 10px 0 0; color: #555; line-height: 1.6;">
            <li><b>Aadhaar and PAN names must match exactly.</b></li>
            <li>File names must match the document requirements (e.g. "PAN Card.pdf").</li>
            <li>No password-protected files.</li>
          </ul>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background: #f1f8ff;">
            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #1A73E8;">Document</th>
            <th style="padding: 12px; text-align: right; border-bottom: 2px solid #1A73E8;">Status</th>
          </tr>
          ${rows}
        </table>

        <div style="margin-top: 25px; background: #fff3cd; padding: 20px; border-radius: 6px; border: 1px solid #ffeeba; text-align: center;">
          <a href="${candidate.driveFolderWebViewLink}" 
             style="display: inline-block; background: #1A73E8; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
             Access Your Folder
          </a>
        </div>

        ${HTML_SIGNATURE}
      </div>
    </div>`;
}