---
title: HTB Enigma Writeup
slug: HTBEnigma
category: _writeups
share: true
date: 2026-10-27
description: A writeup for the HTB machine Enigma
tags: []
---
  
  
**Box at a glance:** a mail-heavy Linux target. The path runs through an exposed NFS share, credential reuse across the company's identity system, an authenticated RCE in _OpenSTAManager_, credentials recovered from the app's config and database, an offline hash crack, and finally a command-injection flaw in a locally-hosted admin tool to reach root.  
  
---  
  
## Recon  
  
We start with a service scan, disabling host discovery (`-Pn`) so the box is scanned even if it doesn't answer ping:  
  
```  
nmap -sV -Pn 10.129.58.202  
```  
  
The results are noticeably mail-heavy seeing a cluster of SMTP/IMAP/POP3-style services sitting alongside the usual web and SSH. When a box leans this hard into email, that's a strong signal the path is going to involve mailboxes, so it's worth keeping in mind.  
  
_Nmap output showing the mail-focused service spread:_ ![[../assets/uploads/Writeup - Enigma-1784156876604.webp|Writeup - Enigma-1784156876604.webp]]  
  
One thing to note early: SSH is configured for key-based authentication only, so password guessing against SSH is off the table. Good to know now rather than after wasting time on it.  
  
_SSH accepting keys only, no password auth:  
 ![[../assets/uploads/Writeup - Enigma-1784158345697.webp|Writeup - Enigma-1784158345697.webp]]  
  
From that service list there are several reasonable first moves. I chose to look at **port 2049 (NFS)** first, since exported NFS shares are a common place to find files that were never meant to be reachable and they often require no credentials at all.  
  
Enumerating the exports with `showmount` immediately reveals a share we can try to mount:  
  
_`showmount` listing an available export:_   
![[../assets/uploads/Writeup - Enigma-1784157093648.webp|388]]  
  
  
To read it, we mount the export locally. First create a local mount point, then attach the remote share to it:  
  
```  
sudo mkdir /mnt/enigma_nfs  
```  
  
```  
sudo mount -t nfs 10.129.58.202:/srv/nfs/onboarding /mnt/enigma_nfs -o nolock  
```  
  
With the share mounted we can browse its contents:  
  
_Files visible inside the mounted onboarding share:  
![[../assets/uploads/Writeup - Enigma-1784157415805.webp|Writeup - Enigma-1784157415805.webp]]  
  
## Foothold  credentials from the share  
  
Inside the share is an onboarding PDF, and it hands us a set of credentials for the user **kevin**:  
  
```  
kevin:Enigma2024!  
```  
  
_The onboarding PDF contents, including Kevin's credentials:_ ![[../assets/uploads/Writeup - Enigma-1784157493217.webp|Writeup - Enigma-1784157493217.webp]]  
  
The same document also names a subdomain  `mail001.enigma.htb`  which lines up with the first web service we saw in the scan. Browsing there prompts for a login, and Kevin's credentials get us in.  
  
Once inside the mailbox, there's very little to work with: only a single email is viewable.  
  
_Kevin's mailbox with one readable message:_   
![[../assets/uploads/Writeup - Enigma-1784157875675.webp|Writeup - Enigma-1784157875675.webp]]  
  
The main thing that email gives us is a second username — **Sarah**.  
  
Trying to _use_ the mail client for anything active — sending a message, attaching a file — throws an error and blocks us. So the mailbox isn't a delivery mechanism for a payload; it's purely a source of information.  
  
_The error returned when attempting to send:_   
![[../assets/uploads/Untitled-1784261509055.webp|Untitled-1784261509055.webp]]  
  
## Credential reuse → Sarah's mailbox  
  
Back to the onboarding PDF, one line stands out:  
  
```  
Generated automatically by Enigma Corp Identity Management System.  
```  
  
If accounts are provisioned automatically by a central identity system, there's a decent chance they're seeded with the same (or a very similar) initial password. That's a testable hypothesis: try Kevin's password pattern against Sarah's account, varying the obvious pieces like the year if the exact match fails.  
  
As it turns out, no variation is even needed because the _exact_ password `Enigma2024!` works for Sarah too.  
  
Inside Sarah's mailbox there's one new email:  
  
_Sarah's mailbox showing the new message:_ ![[../assets/uploads/Writeup - Enigma-1784159153230.webp|Writeup - Enigma-1784159153230.webp]]  
  
This one is more useful. It points to another subdomain, `support_001`, and includes **admin credentials** for it.  
  
## Authenticated RCE  OpenSTAManager (CVE-2026-38751)  
  
Logging into the `support_001` site as admin drops us into an interface with a lot of features to explore.  
  
_The support portal after logging in as admin:_ ![[../assets/uploads/Writeup - Enigma-1784159388712.webp|Writeup - Enigma-1784159388712.webp]]  
  
To find the software version, click the "i" (info) button in the top right — the small text at the bottom identifies the application:  
  
```  
Version 2.9.8 OpenSTAManager  
```  
  
With the exact product and version in hand, I searched for known vulnerabilities. The relevant one is **CVE-2026-38751**, an **authenticated arbitrary file upload** in OpenSTAManager's module-update feature (`modules/aggiornamenti/upload_modules.php`), affecting versions ≤ 2.10.  
  
Here's the actual bug, so the step is defensible: OpenSTAManager lets an authenticated user install add-on modules by uploading a ZIP archive, but it never validates what's inside that archive or constrains where the unpacked files can execute. So a crafted "module"  a ZIP containing a valid module descriptor alongside a PHP webshell  gets unpacked into the web root and served by the application, which executes it in the app's context. The result is remote code execution as the web user. The one precondition is a valid login, which we already have from Sarah's mailbox.  
  
There's a public proof-of-concept that automates the whole sequence, which is why it looks like a single command. Under thetask hood it: authenticates with the supplied credentials, builds the malicious ZIP (module descriptor + PHP shell), uploads it through the module-update endpoint, verifies the shell is reachable by running a test command, and then tries several reverse-shell payloads (bash, python, nc, mkfifo) until one connects back:  
  
```  
https://github.com/b0ySie7e/OpenSTAManager-RCE-Exploit-CVE-2026-38751  
```  
  
Clone the repo and install its dependencies:  
  
_Installing the exploit's dependencies:_ ![[../assets/uploads/Writeup - Enigma-1784234426960.webp|Writeup - Enigma-1784234426960.webp]]  
  
Then run it against the target:  
  
_Running the PoC against the OpenSTAManager instance:_ ![[../assets/uploads/Writeup - Enigma-1784234855543.webp|Writeup - Enigma-1784234855543.webp]]  
  
And catch the reverse shell:  
  
_Reverse shell established back to our machine:_ ![[../assets/uploads/Writeup - Enigma-1784234876887.webp|Writeup - Enigma-1784234876887.webp]]  
  
## Lateral movement  from web user to Haris  
  
We have a shell, but as the web-service account. The next goal is a real user.  
  
The usual quick wins come up empty  `sudo -l` shows nothing useful, and there are no interesting SUID binaries. So we look at _who_ we might be pivoting toward by listing the accounts that actually have a login shell:  
  
_Filtering `/etc/passwd` for accounts with a valid shell:_ ![[../assets/uploads/Writeup - Enigma-1784237729690.webp|Writeup - Enigma-1784237729690.webp]]  
  
That narrows the target to **Haris**.  
  
Since our foothold came through OpenSTAManager, that's the natural place to look for credentials. OpenSTAManager stores its database connection details in:  
  
```  
config.inc.php  
```  
  
Reading that file gives us a database username and password:  
  
```  
$db_username = 'brollin';  
$db_password = 'Fri3nds@9099';  
```  
  
_Database credentials recovered from `config.inc.php`:_ ![[../assets/uploads/Writeup - Enigma-1784236031663.webp|Writeup - Enigma-1784236031663.webp]]  
  
Given the config points at a local database, these are local MySQL credentials so we log in:  
  
_Authenticating to the local MySQL instance:_ ![[../assets/uploads/Writeup - Enigma-1784236334811.webp|Writeup - Enigma-1784236334811.webp]]  
  
Now we hunt for any credentials the application stores in its own tables. First list the databases and switch into the OpenSTAManager one:  
  
_Listing databases and selecting OpenSTAManager's:_ ![[../assets/uploads/Writeup - Enigma-1784237095114.webp|Writeup - Enigma-1784237095114.webp]]  
  
Then enumerate the tables. It's a long list, so here's the one that stood out the user table:  
  
_The table containing application users:  
![[../assets/uploads/Writeup - Enigma-1784237145329.webp|Writeup - Enigma-1784237145329.webp]]  
  
  
Selecting from it returns a stored password hash for **haris**:  
  
_Haris's password hash pulled from the database:_ ![[../assets/uploads/Writeup - Enigma-1784237205676.webp|Writeup - Enigma-1784237205676.webp]]  
  
The format identifies it as **bcrypt**, which hashcat cracks with mode `3200`:  
  
```  
hashcat -m 3200 <hash> /usr/share/wordlists/rockyou.txt  
```  
  
_Cracking the bcrypt hash with hashcat:_ ![[../assets/uploads/Writeup - Enigma-1784237652889.webp|Writeup - Enigma-1784237652889.webp]]  
  
With the recovered password we can log in as Haris:  
  
_Logging in as Haris:  
![[../assets/uploads/Writeup - Enigma-1784237873780.webp|Writeup - Enigma-1784237873780.webp]]  
  
And collect the user flag from the home directory:  
  
_`user.txt` in Haris's home directory:  
![[../assets/uploads/Writeup - Enigma-1784237915319.webp|Writeup - Enigma-1784237915319.webp]]  
  
## Privilege escalation OliveTin command injection  
  
Now we go after root.  
  
Checking which ports are listening _locally_ (services not exposed externally) turns up **port 1337**. A quick `curl` against it identifies the service as **OliveTin** a web GUI that lets non-technical users run predefined commands and backups through the browser.  
  
_`curl` response identifying OliveTin on port 1337:_ ![[../assets/uploads/Writeup - Enigma-1784238349082.webp|Writeup - Enigma-1784238349082.webp]]  
  
`curl` alone won't render it, because the interface requires JavaScript:  
  
Since we have full access as Haris, the cleanest way to actually view the interface is to forward the local port back to our own machine over SSH. Generate a key, place the public half on the target, and pull the private key back to Kali:  
  
_Generating the SSH key and required directories:_ ![[../assets/uploads/Writeup - Enigma-1784238840610.webp|Writeup - Enigma-1784238840610.webp]]  
  
_Placing the public key on the target and copying the private key back:_ ![[../assets/uploads/Writeup - Enigma-1784241813236.webp|Writeup - Enigma-1784241813236.webp]]  
  
_Setting correct permissions on the private key on Kali:_ ![[../assets/uploads/Writeup - Enigma-1784239180143.webp|Writeup - Enigma-1784239180143.webp]]  
  
Then connect over SSH and forward OliveTin's local port (1337) to a local port on our side (8181):  
  
_SSH connection with the port forward established:_ ![[../assets/uploads/Writeup - Enigma-1784241945655.webp|Writeup - Enigma-1784241945655.webp]]  
  
Loading `localhost:8181` in a browser now shows OliveTin's configured actions. We note the action names, then go back to the filesystem to find how they're defined. OliveTin's configuration lives in `/etc/OliveTin`; a `grep` through it shows the actual commands each action runs:  
  
_The OliveTin config, showing the backup command:_ ![[../assets/uploads/Writeup - Enigma-1784243314327.webp|Writeup - Enigma-1784243314327.webp]]  
  
The interesting one is a database backup action. The command it runs places a variable, `db_pass`, directly inside a single-quoted shell argument:  
  
```  
"mysqldump -u {{ db_user }} -p'{{ db_pass }}' {{ db_name }} > /opt/backups/backup.sql"  
```  
  
Because our input for the password is dropped straight into the command line, and OliveTin runs these actions as root, this is a classic **shell command injection** the same idea as SQL injection, but against the shell. The injectable piece is here:  
  
```  
-p'{{ db_pass }}'  
```  
  
If we supply a `db_pass` value that closes the single quote, ends the `mysqldump` command, adds our own command, and comments out the rest of the line, our command runs as root. The payload:  
  
```  
x'; chmod +s /bin/bash #  
```  
  
That makes the backend command resolve to:  
  
```  
mysqldump -u {{ db_user }} -p'x'; chmod +s /bin/bash # {{ db_name }} > /opt/backups/backup.sql  
```  
  
The `'x'` closes the password argument, the `;` starts a new command, `chmod +s /bin/bash` sets the SUID bit on bash, and `#` comments out everything after it — so the redirect to the backup file never runs. What's actually executed is just:  
  
```  
mysqldump -u {{ db_user }} -p'x'; chmod +s /bin/bash #  
```  
  
Trigger it by running the action from OliveTin:  
  
_Executing the backup action with the injected payload:_ ![[../assets/uploads/Writeup - Enigma-1784244579708.webp|Writeup - Enigma-1784244579708.webp]]  
  
Back in our SSH session, bash is now SUID root, so `bash -p` gives us a root shell:  
  
_Dropping into a root shell via the SUID bash:_ ![[../assets/uploads/Writeup - Enigma-1784244608671.webp|Writeup - Enigma-1784244608671.webp]]  
  
And we grab the root flag:  
  
_`root.txt`:_   
![[../assets/uploads/Writeup - Enigma-1784244645968.webp|Writeup - Enigma-1784244645968.webp]]  
