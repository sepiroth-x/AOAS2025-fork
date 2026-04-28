const nodemailer = require('nodemailer');

// Version 2.1 - Fixed 413 error, 3MB file limit, screening questions, skills, cover letter
function getMailTransport() {
  const user = (process.env.GMAIL_USER || '').trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || '').trim();
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass },
  });
}

// Sanitize inputs to prevent XSS
const sanitizeHtml = (str) => {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
};

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const {
      fullName,
      email,
      phone,
      workingHours,
      availability,
      experience,
      yearsExperience,
      resume,
      resumeFileName,
      resumeFileType,
      whyHireYou,
      compensation,
      // New fields
      flexibleSchedule,
      workAuthorization,
      weekendAvailability,
      reliableTransportation,
      previousTermination,
      relevantSkills,
      coverLetter,
      coverLetterFileName,
      coverLetterFileType
    } = req.body;

    // Validate required fields
    if (!fullName || !email || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Full name, email, and phone number are required fields.'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid email address.'
      });
    }

    // Sanitize all inputs
    const sanitizedData = {
      fullName: sanitizeHtml(fullName),
      email: sanitizeHtml(email),
      phone: sanitizeHtml(phone),
      workingHours: sanitizeHtml(workingHours),
      availability: sanitizeHtml(availability),
      experience: sanitizeHtml(experience),
      yearsExperience: sanitizeHtml(yearsExperience),
      resumeFileName: sanitizeHtml(resumeFileName),
      whyHireYou: sanitizeHtml(whyHireYou),
      compensation: sanitizeHtml(compensation),
      // New fields
      flexibleSchedule: sanitizeHtml(flexibleSchedule),
      workAuthorization: sanitizeHtml(workAuthorization),
      weekendAvailability: sanitizeHtml(weekendAvailability),
      reliableTransportation: sanitizeHtml(reliableTransportation),
      previousTermination: sanitizeHtml(previousTermination),
      relevantSkills: sanitizeHtml(relevantSkills),
      coverLetterFileName: sanitizeHtml(coverLetterFileName)
    };

    const nowPh = new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Manila',
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const responseBadge = (value, yesIsPositive = true) => {
      const rawValue = String(value || 'Not answered').trim() || 'Not answered';
      const normalized = rawValue.toLowerCase();
      let tone = { fg: '#334155', bg: '#e2e8f0' };

      if (normalized === 'yes' || normalized === 'no') {
        const isPositive = yesIsPositive ? normalized === 'yes' : normalized === 'no';
        tone = isPositive
          ? { fg: '#166534', bg: '#dcfce7' }
          : { fg: '#991b1b', bg: '#fee2e2' };
      }

      return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;color:${tone.fg};background:${tone.bg};">${rawValue}</span>`;
    };

    const screeningRows = [
      {
        label: 'Willing to adjust work hours / schedule',
        value: sanitizedData.flexibleSchedule,
        yesIsPositive: true
      },
      {
        label: 'Legally authorized to work',
        value: sanitizedData.workAuthorization,
        yesIsPositive: true
      },
      {
        label: 'Willing to work weekends / holidays',
        value: sanitizedData.weekendAvailability,
        yesIsPositive: true
      },
      {
        label: 'Has reliable transportation',
        value: sanitizedData.reliableTransportation,
        yesIsPositive: true
      },
      {
        label: 'Previously terminated from a job',
        value: sanitizedData.previousTermination,
        yesIsPositive: false
      }
    ].map((item) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #dbe7f2;color:#334155;font-size:13px;">${item.label}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #dbe7f2;text-align:right;">${responseBadge(item.value, item.yesIsPositive)}</td>
      </tr>
    `).join('');

    const transporter = getMailTransport();
    if (!transporter) {
      console.error('❌ Gmail SMTP not configured');
      return res.status(500).json({
        success: false,
        error: 'Email service not configured. Please set GMAIL_USER and GMAIL_APP_PASSWORD environment variables.'
      });
    }

    console.log(`📧 Attempting to send career application from ${email} (${fullName})`);

    // Decode base64 file data for resume
    let attachmentContent = null;
    if (resume && resumeFileName) {
      // Remove data URL prefix (e.g., "data:application/pdf;base64,")
      const base64Data = resume.split(',')[1];
      attachmentContent = Buffer.from(base64Data, 'base64');
    }

    // Decode base64 file data for cover letter
    let coverLetterContent = null;
    if (coverLetter && coverLetterFileName) {
      const base64Data = coverLetter.split(',')[1];
      coverLetterContent = Buffer.from(base64Data, 'base64');
    }

    const replyAddress = String(email || '').trim();
    // Prepare email options
    const emailOptions = {
      from: `APPLICATION FORM <${process.env.GMAIL_USER}>`,
      replyTo: replyAddress || undefined,
      to: [process.env.CAREERS_EMAIL || 'careers@aoa-services.com'],
      subject: `New Job Application from ${sanitizedData.fullName}`,
      html: `
        <div style="margin:0;padding:24px;background:#eef2f7;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;">
          <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;overflow:hidden;">
            <div style="padding:24px 26px;background:linear-gradient(135deg,#0f766e,#0284c7);color:#ffffff;">
              <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.92;">AOAS Recruitment Desk</p>
              <h2 style="margin:10px 0 0 0;font-size:27px;line-height:1.25;">New Career Application</h2>
              <p style="margin:10px 0 0 0;font-size:14px;opacity:0.95;">From: ${sanitizedData.fullName}</p>
            </div>

            <div style="padding:22px 24px;">
              <div style="margin-bottom:16px;padding:12px 14px;border:1px solid #dbe7f2;border-radius:12px;background:#f8fafc;">
                <p style="margin:0;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Reply-To (Applicant)</p>
                <p style="margin:6px 0 0 0;font-size:15px;font-weight:700;">
                  <a href="mailto:${sanitizedData.email}" style="color:#0284c7;text-decoration:none;">${sanitizedData.email}</a>
                </p>
              </div>

              <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:0;border:1px solid #dbe7f2;border-radius:12px;overflow:hidden;">
                <tbody>
                  <tr>
                    <td style="width:34%;padding:10px 12px;border-bottom:1px solid #dbe7f2;background:#f8fafc;color:#334155;font-size:13px;font-weight:700;">Full Name</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #dbe7f2;color:#0f172a;font-size:14px;">${sanitizedData.fullName}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 12px;border-bottom:1px solid #dbe7f2;background:#f8fafc;color:#334155;font-size:13px;font-weight:700;">Email</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #dbe7f2;color:#0f172a;font-size:14px;">
                      <a href="mailto:${sanitizedData.email}" style="color:#0284c7;text-decoration:none;">${sanitizedData.email}</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:10px 12px;background:#f8fafc;color:#334155;font-size:13px;font-weight:700;">Phone Number</td>
                    <td style="padding:10px 12px;color:#0f172a;font-size:14px;">${sanitizedData.phone}</td>
                  </tr>
                </tbody>
              </table>

              <h3 style="margin:20px 0 10px 0;font-size:15px;color:#0f766e;letter-spacing:0.02em;text-transform:uppercase;">Work Preferences</h3>
              <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:0;border:1px solid #dbe7f2;border-radius:12px;overflow:hidden;">
                <tbody>
                  <tr>
                    <td style="width:34%;padding:10px 12px;border-bottom:1px solid #dbe7f2;background:#f8fafc;color:#334155;font-size:13px;font-weight:700;">Preferred Working Hours</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #dbe7f2;color:#0f172a;font-size:14px;">${sanitizedData.workingHours || 'Not specified'}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 12px;border-bottom:1px solid #dbe7f2;background:#f8fafc;color:#334155;font-size:13px;font-weight:700;">Availability</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #dbe7f2;color:#0f172a;font-size:14px;">${sanitizedData.availability || 'Not specified'}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 12px;border-bottom:1px solid #dbe7f2;background:#f8fafc;color:#334155;font-size:13px;font-weight:700;">Years of Experience</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #dbe7f2;color:#0f172a;font-size:14px;">${sanitizedData.yearsExperience || 'Not specified'}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 12px;background:#f8fafc;color:#334155;font-size:13px;font-weight:700;">Expected Compensation</td>
                    <td style="padding:10px 12px;color:#0f172a;font-size:14px;">${sanitizedData.compensation || 'Not specified'}</td>
                  </tr>
                </tbody>
              </table>

              <h3 style="margin:20px 0 10px 0;font-size:15px;color:#0f766e;letter-spacing:0.02em;text-transform:uppercase;">Screening Summary</h3>
              <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:0;border:1px solid #dbe7f2;border-radius:12px;overflow:hidden;">
                <tbody>
                  ${screeningRows}
                </tbody>
              </table>

              <h3 style="margin:20px 0 8px 0;font-size:15px;color:#0f766e;letter-spacing:0.02em;text-transform:uppercase;">Experience and Skills</h3>
              <div style="white-space:pre-wrap;padding:12px 14px;background:#f8fafc;border:1px solid #dbe7f2;border-radius:12px;color:#0f172a;line-height:1.56;">${sanitizedData.experience || 'Not provided'}</div>

              <h3 style="margin:16px 0 8px 0;font-size:15px;color:#0f766e;letter-spacing:0.02em;text-transform:uppercase;">Relevant Skills</h3>
              <div style="white-space:pre-wrap;padding:12px 14px;background:#f8fafc;border:1px solid #dbe7f2;border-radius:12px;color:#0f172a;line-height:1.56;">${sanitizedData.relevantSkills || 'Not provided'}</div>

              <h3 style="margin:16px 0 8px 0;font-size:15px;color:#0f766e;letter-spacing:0.02em;text-transform:uppercase;">Why Hire This Candidate</h3>
              <div style="white-space:pre-wrap;padding:12px 14px;background:#f8fafc;border:1px solid #dbe7f2;border-radius:12px;color:#0f172a;line-height:1.56;">${sanitizedData.whyHireYou || 'Not provided'}</div>

              <h3 style="margin:16px 0 8px 0;font-size:15px;color:#0f766e;letter-spacing:0.02em;text-transform:uppercase;">Attachments</h3>
              <div style="padding:12px 14px;background:#ecfdf5;border:1px solid #b7e4cc;border-radius:12px;">
                <p style="margin:0 0 6px 0;color:#14532d;font-size:13px;font-weight:700;">Resume</p>
                <p style="margin:0;color:#334155;font-size:14px;">${sanitizedData.resumeFileName || 'resume'}</p>
                ${sanitizedData.coverLetterFileName ? `
                  <p style="margin:10px 0 6px 0;color:#14532d;font-size:13px;font-weight:700;">Cover Letter</p>
                  <p style="margin:0;color:#334155;font-size:14px;">${sanitizedData.coverLetterFileName}</p>
                ` : ''}
              </div>

              <div style="margin-top:18px;padding-top:14px;border-top:1px solid #dbe7f2;">
                <p style="margin:0;color:#64748b;font-size:12px;">Submitted via AOAS Careers page</p>
                <p style="margin:6px 0 0 0;color:#64748b;font-size:12px;">Received on ${nowPh} (PH Time)</p>
              </div>
            </div>
          </div>
        </div>
      `,
      text: `
New Career Application

CONTACT INFORMATION
-------------------
Full Name: ${fullName}
Email: ${email}
Phone Number: ${phone}

WORK PREFERENCES
----------------
Preferred Working Hours: ${workingHours || 'Not specified'}
Availability: ${availability || 'Not specified'}
Years of Experience: ${yearsExperience || 'Not specified'}
Expected Compensation: ${compensation || 'Not specified'}

SCREENING QUESTIONS
-------------------
Willing to adjust work hours/schedule: ${flexibleSchedule || 'Not answered'}
Legally authorized to work: ${workAuthorization || 'Not answered'}
Willing to work weekends/holidays: ${weekendAvailability || 'Not answered'}
Has reliable transportation: ${reliableTransportation || 'Not answered'}
Previously terminated from a job: ${previousTermination || 'Not answered'}

EXPERIENCE & SKILLS
-------------------
${experience || 'Not provided'}

RELEVANT SKILLS
---------------
${relevantSkills || 'Not provided'}

WHY HIRE THIS CANDIDATE?
------------------------
${whyHireYou || 'Not provided'}

ATTACHMENTS
-----------
Resume: ${resumeFileName || 'resume'}
${coverLetterFileName ? `Cover Letter: ${coverLetterFileName}` : 'Cover Letter: Not provided'}

---
This application was submitted through the AOAS Careers page.
Received on ${nowPh} (PH Time)
      `,
    };

    // Add attachments
    emailOptions.attachments = [];

    if (attachmentContent && resumeFileName) {
      emailOptions.attachments.push({
        filename: resumeFileName,
        content: attachmentContent
      });
    }

    if (coverLetterContent && coverLetterFileName) {
      emailOptions.attachments.push({
        filename: coverLetterFileName,
        content: coverLetterContent
      });
    }

    // Send email using Gmail SMTP
    const info = await transporter.sendMail(emailOptions);
    console.log(`✅ Career application email sent successfully! Message ID: ${info.messageId}`);

    res.json({
      success: true,
      message: 'Thank you for your application! We will review your submission and get back to you soon.',
    });

  } catch (error) {
    console.error('❌ Server error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message || 'An unexpected error occurred. Please try again later.'
    });
  }
};

