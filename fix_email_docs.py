import docx

doc = docx.Document('HotelEase_SRS.docx')

for p in doc.paragraphs:
    # 1. Product Perspective
    if "Firebase Cloud Functions for server-side operations like email notifications." in p.text:
        p.text = p.text.replace(
            "Firebase Cloud Functions for server-side operations like email notifications.",
            "EmailJS for client-side booking confirmation emails, and Firebase Cloud Functions (if deployed) for backend logic."
        )
    
    # 2. Hardware Interfaces (Cloud Infrastructure)
    if "Cloud Functions: Serverless compute for email notifications and backend logic." in p.text:
        p.text = p.text.replace(
            "Cloud Functions: Serverless compute for email notifications and backend logic.",
            "Cloud Functions: Serverless compute for backend logic (Note: email notifications are primarily handled client-side via EmailJS)."
        )
    
    # 3. Software Interfaces (Backend / Cloud Services)
    if "Firebase Cloud Functions — Serverless functions for email triggers (Nodemailer + Gmail SMTP)." in p.text:
        p.text = p.text.replace(
            "Firebase Cloud Functions — Serverless functions for email triggers (Nodemailer + Gmail SMTP).",
            "EmailJS (@emailjs/browser) — Client-side email service used for sending automated booking confirmation emails."
        )
    
    # 4. Communications Interfaces (Email Services)
    if "Firebase Cloud Functions integrate with Nodemailer using Gmail SMTP to send automated email notifications for booking confirmations, approvals, rejections, and support replies." in p.text:
        p.text = "EmailJS integrates with the frontend to send automated booking confirmation emails upon FO approval. Firebase Cloud Functions are loosely referenced for support replies but are not required for core email functionality."

    # 5. Core Modules (Support Messaging)
    if "FO staff can view, mark as read, and reply with optional email notification via Firebase Cloud Functions." in p.text:
        p.text = p.text.replace(
            "via Firebase Cloud Functions.",
            "(via Cloud Functions if deployed, otherwise handled via in-app notifications)."
        )

doc.save('HotelEase_SRS.docx')
print("Successfully fixed EmailJS documentation")
