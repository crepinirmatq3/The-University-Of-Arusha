# University of Arusha website

## Run the site and private inbox

Install Node.js 22.13 or later. In PowerShell, open this folder and create the admin credentials once:

```powershell
npm run setup-admin
```

Enter a username and a password of at least 12 characters when prompted. Password input is hidden. The username, random salt, and password hash are saved in `../project-33-private/admin-credentials.json`; the password itself is not saved. Run the setup command again to replace the admin credentials.

Create each student or staff account from an interactive terminal before signing in:

```powershell
npm run setup-portal-user
```

Choose the account type and enter its username or ID, display name, and password. Password input is hidden and passwords must be at least 12 characters. Run this command once per account; rerunning it for the same account type and username updates that account's display name and password. Portal accounts are not self-registered.

Then start the server:

```powershell
npm start
```

Open the website at `http://localhost:3000`, the student portal at `http://localhost:3000/student-portal.html`, the staff portal at `http://localhost:3000/staff-portal.html`, and the private admin dashboard at `http://localhost:3000/admin.html`. In the signed-in admin dashboard, use **Portal accounts** to view usernames and create accounts or reset passwords. Passwords are never shown again after submission; resetting one signs that account out of existing sessions. Portal passwords are stored as salted scrypt hashes in `../project-33-private/portal-users.sqlite`; portal sessions use HTTP-only cookies. Contact messages, admission applications, uploaded documents, and the admin credential hash are also saved in the sibling `project-33-private` folder, not in the public website folder. Uploaded application documents are limited to PDF, JPG, or PNG files of up to 5 MB and are only downloadable by a signed-in admin. Restrict access to the private folder and back it up securely.

The server listens on `127.0.0.1` by default. For production, put it behind an HTTPS reverse proxy, set `NODE_ENV=production`, and configure the host and port in the hosting environment. Do not expose the server directly to the internet over plain HTTP.

The previous PHP login files have been removed. This Node server must be running for the portals, contact form, and admin inbox to work; opening the HTML files directly will not work.