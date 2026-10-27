---
title: VaguePosting - USCC West Coast 2026
slug: vagueposting_uscc_2026
category: _writeups
share: true
date: 2026-07-24
description: Writeup for the VaguePosting web challenge from USCC West Coast 2026. Covers endpoint discovery, Lodash template injection, and gaining RCE through server-side template injection.
tags:
  - Web
  - SSTI
  - Node.js
  - Lodash
  - RCE
  - CTF
---
  
This will be a somewhat condensed writeup for the web challenge VaguePosting.  
  
**Short version:** the site lets you save an away message that is fed straight into a server-side template engine (Lodash). Because we control the template text, we can inject template code that the server runs for us and it leads to full command execution on the box.  
  
We start on a webpage looking like the picture below:  
![[../assets/uploads/VaguePosting - USCC - WEB-1784930938454.webp|VaguePosting - USCC - WEB-1784930938454.webp]]  
  
Pressing the buttons does nothing except the `away` button, which lets you type a message and upload it to the site. That upload is our one piece of user input, so it's the first thing worth investigating.  
![[../assets/uploads/VaguePosting - USCC - WEB-1784937414898.webp|VaguePosting - USCC - WEB-1784937414898.webp]]  
  
Next, read the page source to see exactly how it handles the input for `away`:  
  
```javascript  
async function saveAwayMessage() {  
    const awayMessage = document.getElementById('away-message').value;  
  
    const response = await fetch('/api/latest/template', {  
        method: 'POST',  
        headers: { 'Content-Type': 'application/json' },  
        body: JSON.stringify({  
            template: awayMessage,         // <-- our input goes here  
            data: {  
                username: 'hackergurl',  
                time: new Date().toLocaleTimeString(),  
                date: new Date().toLocaleDateString()  
            }  
        })  
    });  
}  
```  
  
The main things we learn from this:  
  
- Our input is sent as `template` in a JSON POST to `/api/latest/template`.  
- The `data` object supplies variables (`username`, `time`, `date`) that the template can reference.  
  
The word "template" is big here since the server isn't just storing our text, it's rendering it as a template. If we can figure out which template engine it uses, we can look up how to abuse it.  
  
The POST for this request is seen below:  
![[../assets/uploads/VaguePosting - USCC - WEB-1784928571772.webp|VaguePosting - USCC - WEB-1784928571772.webp]]  
  
When checking `/robots.txt` we get an endpoint that reveals the location of service versions.    
![[../assets/uploads/VaguePosting - USCC - WEB-1784937471164.webp|VaguePosting - USCC - WEB-1784937471164.webp]]  
  
By checking that endpoint we get the following versions:  
![[../assets/uploads/VaguePosting - USCC - WEB-1784930057560.webp|VaguePosting - USCC - WEB-1784930057560.webp]]  
  
Knowing the exact library and version matters, because it lets us search for the specific way that version can be exploited.  
  
Since we already saw templates being used in the POST request, a good next step is to research how **Lodash** handles templates. (Lodash is a very common JavaScript utility library; one of its features, `_.template`, turns a string into a rendered output  and that feature can be abused.)  
  
![[../assets/uploads/VaguePosting - USCC - WEB-1784929963940.webp|VaguePosting - USCC - WEB-1784929963940.webp]]  
  
Now we know the server likely uses Lodash's `_.template(string)`:  
  
https://www.geeksforgeeks.org/javascript/lodash-_-template-method/  
https://lodash.com/docs/#template <- has TONS of info to be able to complete this challenge  
  
  
`_.template` compiles a string into a function. Inside that string, special markers called **delimiters** are treated as code instead of plain text:  
  
- "interpolate" delimiters (`<%= %>`) evaluate JavaScript and print the returned value.  
- "evaluate" delimiters (`<% %>`) run raw JavaScript silently (nothing is printed back).  
  
Either way, if we control the template string we control the JavaScript that runs on the server and that is our path to command injection. Since we actually want to see the output of our commands, we'll use the **interpolate** delimiter (`<%= %>`) so the result gets reflected back in the HTTP response.  
  
  
  
We can start crafting our request from a few things  
![[../assets/uploads/VaguePosting - USCC - WEB-1784934128537.webp|VaguePosting - USCC - WEB-1784934128537.webp]]  
  
  
Also to run OS command in nodejs we need   
  
`require('child_process').execSync('command')`  
  
We can now test this by POSTing to our specific version of the API and putting a malicious template into the vulnerable endpoint, where we should be able to get command injection:  
  
As noted above, we use the interpolate delimiter `<%= %>` (not the silent `<% %>` evaluate one) so our command's output is printed back to us in the response.  
  
Initially we see that you need to define "require"  
![[../assets/uploads/VaguePosting - USCC - WEB-1784934710812.webp|VaguePosting - USCC - WEB-1784934710812.webp]]  
  
We need to use the following below instead  
```  
process.mainModule.require  
```  
  
this leaves us with the following to inject  
```  
<%= process.mainModule.require('child_process').execSync('id') %>"  
```  
  
POST /api/lodash-4.17.20/template`  
![[../assets/uploads/VaguePosting - USCC - WEB-1784935694643.webp|VaguePosting - USCC - WEB-1784935694643.webp]]  
  
The above POST request results in the output below, confirming we have command injection (our injected code ran on the server and returned its result):  
![[../assets/uploads/VaguePosting - USCC - WEB-1784931116684.webp|VaguePosting - USCC - WEB-1784931116684.webp]]  
  
From here we can run commands until we find our flag.  
  
Our request:  
![[../assets/uploads/VaguePosting - USCC - WEB-1784935787436.webp|VaguePosting - USCC - WEB-1784935787436.webp]]  
  
Our response ending with the flag  
![[../assets/uploads/VaguePosting - USCC - WEB-1784932053410.webp|VaguePosting - USCC - WEB-1784932053410.webp]]  
  
  
Usefull resource to learn more  
https://portswigger.net/web-security/server-side-template-injection  
  
