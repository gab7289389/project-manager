# 🚀 Project Manager - Complete Setup Guide

## What You're Building

A fully functional project management app with:
- ✅ **Persistent data** - Everything saves to a real database
- ✅ **Real email sending** - Magic links sent to clients
- ✅ **File storage** - Upload and share files
- ✅ **Works everywhere** - Desktop, mobile, any device

**Total Time:** ~45 minutes  
**Total Cost:** FREE (for small scale)

---

## Step 1: Create a Supabase Account (5 min)

Supabase is your database + file storage. It's free.

1. Go to **[supabase.com](https://supabase.com)**
2. Click **"Start your project"**
3. Sign up with GitHub (easiest) or email
4. Click **"New Project"**
5. Fill in:
   - **Name:** `project-manager`
   - **Database Password:** Create a strong password (SAVE THIS!)
   - **Region:** Choose closest to you
6. Click **"Create new project"**
7. Wait 2-3 minutes for setup

### Get Your Supabase Keys

1. In your Supabase dashboard, click **Settings** (gear icon) → **API**
2. Copy these two values (you'll need them later):
   - **Project URL** → looks like `https://abc123.supabase.co`
   - **anon public key** → starts with `eyJ...`

---

## Step 2: Set Up the Database (5 min)

1. In Supabase dashboard, click **SQL Editor** (left sidebar)
2. Click **"New query"**
3. Copy the ENTIRE contents of the file: `supabase/schema.sql`
4. Paste it into the SQL editor
5. Click **"Run"** (or Cmd+Enter)
6. You should see "Success. No rows returned"

✅ Your database tables are now created!

---

## Step 3: Set Up File Storage (3 min)

1. In Supabase dashboard, click **Storage** (left sidebar)
2. Click **"New bucket"**
3. Name it: `project-files`
4. Toggle ON **"Public bucket"**
5. Click **"Create bucket"**

✅ Your file storage is ready!

---

## Step 4: Create a Resend Account (5 min)

Resend sends your emails. It's free for 100 emails/day.

1. Go to **[resend.com](https://resend.com)**
2. Click **"Get Started"**
3. Sign up with GitHub or email
4. After signing in, click **"API Keys"** (left sidebar)
5. Click **"Create API Key"**
   - **Name:** `project-manager`
   - **Permission:** Full access
6. Copy the API key (starts with `re_...`) - SAVE THIS!

⚠️ **Important:** For emails to actually send, you need to verify a domain. But for testing, Resend lets you send to your own email address.

---

## Step 5: Create a Vercel Account (3 min)

Vercel hosts your app for free.

1. Go to **[vercel.com](https://vercel.com)**
2. Click **"Sign Up"**
3. Choose **"Continue with GitHub"** (easiest)
4. Authorize Vercel

---

## Step 6: Deploy to Vercel (10 min)

### Option A: Deploy via GitHub (Recommended)

1. Go to **[github.com](https://github.com)** and sign in
2. Click **"+"** → **"New repository"**
3. Name it: `project-manager`
4. Click **"Create repository"**
5. On your computer, download the `project-manager-production.zip` file
6. Unzip it and open the folder
7. Upload all files to GitHub:
   - Click **"uploading an existing file"** on GitHub
   - Drag in ALL the files from the unzipped folder
   - Click **"Commit changes"**

8. Go to **[vercel.com/new](https://vercel.com/new)**
9. Click **"Import"** next to your `project-manager` repo
10. **IMPORTANT:** Before clicking Deploy, add environment variables:
    - Click **"Environment Variables"**
    - Add these:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `RESEND_API_KEY` | Your Resend API key |
| `NEXT_PUBLIC_APP_URL` | Leave blank for now |

11. Click **"Deploy"**
12. Wait 2-3 minutes
13. You'll get a URL like `project-manager-abc123.vercel.app`
14. Go back to **Settings → Environment Variables**
15. Edit `NEXT_PUBLIC_APP_URL` and set it to your new URL (e.g., `https://project-manager-abc123.vercel.app`)
16. Click **Deployments** → click the **...** menu on latest deployment → **Redeploy**

---

## Step 7: Test Your App! (5 min)

1. Open your Vercel URL
2. You should see the Project Manager app!
3. Try these tests:

### Test Database
- Go to **Database** tab
- Add a new client
- Refresh the page
- The client should still be there ✅

### Test File Upload
- Create a new project
- Try uploading a file to a client task
- It should show "Ready" ✅

### Test Email (Optional)
- Upload a file for a client task
- Click "Send to Client"
- Check if email arrives (send to your own email for testing)

---

## 🎉 You're Done!

Your app is now live with:
- ✅ Permanent data storage
- ✅ File uploads that persist
- ✅ Real email sending with magic links
- ✅ Mobile-friendly design
- ✅ Secure HTTPS
- ✅ Access from any device

---

## Troubleshooting

### "Error loading data"
- Check your Supabase URL and key are correct in Vercel environment variables
- Make sure you ran the SQL schema in Step 2
- Check there are no typos in the environment variable names

### Files not uploading
- Check the Storage bucket exists in Supabase
- Make sure the bucket is named exactly `project-files`
- Make sure "Public bucket" is enabled

### Emails not sending
- Check your Resend API key is correct
- For testing, send to the email you used to sign up for Resend
- For production, you need to verify a domain in Resend

### App shows blank page
- Check Vercel deployment logs for errors
- Make sure all 4 environment variables are set
- Try redeploying

---

## Optional Upgrades

### Custom Domain
1. In Vercel, go to your project → **Settings → Domains**
2. Add your domain (e.g., `projects.yourbusiness.com`)
3. Follow the DNS instructions Vercel provides
4. Update `NEXT_PUBLIC_APP_URL` to your custom domain

### Set Up Email Domain (Recommended for production)
To send emails from your domain (not spam folder):
1. In Resend dashboard, click **"Domains"**
2. Click **"Add Domain"**
3. Enter your domain (e.g., `yourbusiness.com`)
4. Add the DNS records Resend provides
5. Wait for verification (can take up to 24 hours)
6. Edit `/src/pages/api/send-email.js` and change the `from` address

---

## Cost Summary

| Usage Level | Monthly Cost |
|-------------|-------------|
| **Free Tier** (getting started) | $0 |
| **Small Business** (hundreds of projects) | ~$25/month |
| **Growing Business** (thousands of projects) | ~$50-100/month |

**Breakdown:**
- **Supabase:** Free up to 500MB database + 1GB file storage, then $25/month
- **Vercel:** Free for personal use, $20/month for teams
- **Resend:** Free for 100 emails/day, then $20/month for 5,000/month

---

## Files Included

```
project-manager-production/
├── src/
│   ├── lib/
│   │   └── supabase.js        # Database functions
│   ├── pages/
│   │   ├── api/
│   │   │   └── send-email.js  # Email sending API
│   │   ├── download/
│   │   │   └── [token].js     # Client download page
│   │   ├── _app.js
│   │   └── index.js           # Main app
│   └── styles/
│       └── globals.css
├── supabase/
│   └── schema.sql             # Database schema
├── .env.example               # Environment variables template
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.js
└── SETUP-GUIDE.md             # This file!
```

---

## Need Help?

- **Supabase Docs:** [supabase.com/docs](https://supabase.com/docs)
- **Vercel Docs:** [vercel.com/docs](https://vercel.com/docs)
- **Resend Docs:** [resend.com/docs](https://resend.com/docs)

Good luck! 🚀
