/* English versions of the in-panel guides (dashboard/guides.js keeps the Spanish ones).
   Same slugs, so links between guides work in both languages. Static, trusted content. */
(() => {
  'use strict';

  window.agentGuidesEn = [
    {
      slug: 'empezar',
      title: 'Getting started',
      summary: 'What each tab does and the path from an idea to a published video.',
      keywords: 'start getting started tour overview summary inicio empezar',
      body: `
        <p class="lead">Oraflow produces videos for your channel with several AI agents: it researches, writes the script, adds voice and images, edits the video and gets it ready to publish. You review and approve.</p>
        <h3>A video's journey</h3>
        <ol class="steps">
          <li><strong>Idea.</strong> It comes from <em>Research</em>, from <em>Calendar & ideas</em> or from the <em>Create video</em> button.</li>
          <li><strong>Production.</strong> The agents do the script, voice, scenes, edit, title and thumbnail. You watch it progress in <em>Today → Jobs</em>.</li>
          <li><strong>Review.</strong> The video lands in <em>Pipeline</em> as "Needs review". Open it and check the video, the script and the thumbnail.</li>
          <li><strong>Approval and publishing.</strong> Approving it schedules it. Uploading to YouTube on its own requires the channel to be connected (<a href="#" data-guide-link="cuentas">Accounts and keys</a>).</li>
        </ol>
        <h3>The tabs</h3>
        <p>The dark menu on the left groups them: <strong>Today</strong>, <strong>YouTube</strong> (videos, Shorts, calendar, research and autopilot), <strong>Social</strong> (Instagram, Facebook and comments), <strong>Results</strong>, <strong>System</strong> and <strong>Help</strong>. Hover over each one and its options open beside it. On a phone, use the ☰ button at the top.</p>
        <p>Top right is <strong>your profile</strong> (your initials): that's where you choose light or dark theme, language, the screen that opens when you sign in and the compact view. Each person on the team has their own. <a href="#" data-guide-link="perfil">More</a>.</p>
        <dl class="guide-defs">
          <dt>Today</dt><dd>What needs your attention today and the jobs in progress.</dd>
          <dt>Research</dt><dd>Niches, ideas and YouTube signals before producing.</dd>
          <dt>Shorts</dt><dd>Verse Shorts in batches. <a href="#" data-guide-link="shorts">Guide</a>.</dd>
          <dt>Clipping</dt><dd>Subtitled vertical clips for campaigns. <a href="#" data-guide-link="clipping">Guide</a>.</dd>
          <dt>Autonomous operator</dt><dd>Give it the channel strategy and it plans and produces on its own.</dd>
          <dt>Pipeline</dt><dd>Every video, with search and status filters.</dd>
          <dt>Calendar & ideas</dt><dd>What's scheduled and the list of pending ideas.</dd>
          <dt>Analytics / Engagement</dt><dd>Channel results and audience comments.</dd>
          <dt>Production readiness</dt><dd>Checks the whole path works before leaving it on autopilot.</dd>
          <dt>Accounts</dt><dd>Which services are connected and whether they work.</dd>
          <dt>Channel setup</dt><dd>Voice, tone and rules every agent follows.</dd>
        </dl>
        <p class="tip">Shortcut: press <kbd>Ctrl</kbd> <kbd>K</kbd> (or <kbd>/</kbd>) to search for anything. <a href="#" data-guide-link="buscador">More shortcuts</a>.</p>`
    },
    {
      slug: 'redes',
      title: 'Instagram and Facebook on autopilot',
      summary: 'What goes out on its own each day, at what time, and how to turn each piece on, off or move it.',
      keywords: 'social instagram facebook reel carousel date quote story schedule publish redes',
      body: `
        <p class="lead">In <em>Social</em> you see every piece that publishes on its own, with its time and the latest one that went out (with a link to view it). If something failed, it shows in red with the reason.</p>
        <h3>What goes out each day (New York time)</h3>
        <dl class="guide-defs">
          <dt>07:00 · Dated morning prayer</dt><dd>An image with the day's date. It's the most shared format in the niche (the "good morning" people forward).</dd>
          <dt>09:00 · Prayer of the day</dt><dd>A short Reel with music that invites people to comment «Amén».</dd>
          <dt>12:00 · Carousel</dt><dd>4 prayers with their verse; on Facebook it goes out as a Reel with music.</dd>
          <dt>20:00 · Quote to share</dt><dd>White background, a quote about Jesus as King of kings and the real verse.</dd>
          <dt>Story</dt><dd>When the long YouTube video goes out: on Facebook it publishes on its own; the Instagram one you upload yourself (see <a href="#" data-guide-link="historia">Story with a link</a>).</dd>
        </dl>
        <h3>Changing something</h3>
        <p>Each card has its <em>On</em> switch and its <em>Time</em>. Whatever you change applies from the next round (every 15 min).</p>
        <p class="tip">Every prayer ends in «Amén» and exalts Jesus of Nazareth as King of kings. If the AI forgets, the system adds it.</p>`
    },
    {
      slug: 'textos',
      title: "The channel's texts and links",
      summary: 'Edit the pinned comment, the private message, the «Amén» replies, the book, the coupon and the YouTube footer.',
      keywords: 'texts edit pinned comment private message dm coupon book footer description youtube amen replies textos',
      body: `
        <p class="lead">Everything the channel writes on its own is edited in <em>Social → Texts and links</em>. Save it and it's used from the next post or reply; <em>Restore the original text</em> undoes your changes.</p>
        <h3>What can be changed</h3>
        <dl class="guide-defs">
          <dt>Pinned comment</dt><dd>One for carousels and images, another for Reels and another for the dated prayer. The system writes it on every new post; you only tap the 📌 pin (Instagram doesn't allow pinning through the API).</dd>
          <dt>Private message</dt><dd>Greeting, book paragraph and sign-off. The prayer in the middle comes from a list of 40 different ones. In the book paragraph, <code>{cupon}</code> and <code>{libro}</code> are filled in automatically.</dd>
          <dt>Notice on the comment</dt><dd>What gets replied publicly when the prayer is sent privately. One option per line: they take turns.</dd>
          <dt>«Amén» replies</dt><dd>One per line. <code>{n}</code> adds ", Name" if known; in «Amén + name», <code>{q}</code> is who is being prayed for.</dd>
          <dt>Book and coupon</dt><dd>The Hotmart code, the sales page and the book line in the post texts (leave it empty to remove it).</dd>
          <dt>YouTube footer</dt><dd>Empty = the usual one. If you change it, start with the <code>━━━━━━━━━━━━━━━</code> rule and put each link alone on its line: that way YouTube shows it with its icon.</dd>
        </dl>
        <p class="warn">No 🕊️ in the comments, and always Jesus of Nazareth as King of kings.</p>`
    },
    {
      slug: 'comentarios',
      title: 'Comments, «Amén» and private messages',
      summary: 'What gets answered on its own on YouTube, Instagram and Facebook, when, and what is left to you.',
      keywords: 'comments amen automatic reply private dm instagram youtube facebook prayer comentarios',
      body: `
        <p class="lead">The channel answers the repetitive things on its own so you can focus on what matters.</p>
        <h3>YouTube and Facebook</h3>
        <p>Every 30-90 minutes (at random, so it doesn't look like a bot) it replies to comments that are just «Amén» or «Amén + name» («Amén por mi hija Ana» → «Hoy oramos por tu hija Ana…»). Health requests, questions or stories are left to you, in <em>Engagement</em>.</p>
        <h3>Instagram</h3>
        <p>4-9 minutes after <strong>any</strong> comment, the person gets a prayer by private message (40 different ones) with the book and the coupon, and their comment gets a reply saying the prayer was sent privately 💌. Once per person; if they write «Amén» again, they get a normal reply.</p>
        <p class="warn">For Instagram and Facebook to see the public's comments, your Meta app has to be <strong>in live mode</strong> (in development mode it only sees its admins' comments). It also needs a privacy policy URL and a data-deletion URL.</p>
        <p>In <em>Social → «Amén» replies</em> you see how many went out today, the next round, the status of each network and the latest replies with their link.</p>`
    },
    {
      slug: 'mensajes',
      title: 'Messages: connect apps and automate',
      summary: 'Connect Instagram, Facebook, WhatsApp, Telegram and YouTube, create a message per video and see what went out.',
      keywords: 'messages inbox automations rules runs accounts connect whatsapp telegram instagram facebook youtube meta live app review mensajes',
      body: `
        <p class="lead">All your conversations and automatic replies in one place: the <strong>Messages</strong> menu.</p>
        <dl class="guide-defs">
          <dt>Overview</dt><dd>Each connected account, whether it has an error, its active rules and what went out today.</dd>
          <dt>Inbox</dt><dd>Private messages from Instagram, Facebook, WhatsApp and Telegram together. You reply from there (Meta only allows replies within 24 h of the person's last message).</dd>
          <dt>Automations</dt><dd>The rules: "on this video, whoever comments <em>book</em> gets this private message and this reply".</dd>
          <dt>Runs</dt><dd>Every comment or message handled: to whom, what they wrote, whether it went out and, if not, why.</dd>
          <dt>Accounts</dt><dd>Connect and remove apps. You can have several of each.</dd>
        </dl>
        <h3>1. Connect an app</h3>
        <ol class="steps">
          <li><em>Messages → Accounts → Connect account</em>.</li>
          <li>Pick the app. Its <strong>step-by-step instructions</strong> open (where to get the token and which permissions to tick).</li>
          <li>Paste the details and press <strong>Check and connect</strong>: it's tested against the real app before saving. The token is stored encrypted and never shown again.</li>
        </ol>
        <p><strong>Telegram</strong> works right away. <strong>YouTube</strong> uses the channel that already publishes (no token). <strong>Instagram, Facebook and WhatsApp</strong> depend on the Meta app being live (step 4). <strong>TikTok and X</strong> not yet: their APIs require approval or are paid; the catalog explains why.</p>
        <h3>2. Create an automatic message for a video</h3>
        <ol class="steps">
          <li><em>Automations → New rule</em>. Pick the account and the video (or "All posts").</li>
          <li>Write the words that trigger it (<code>book, prayer</code>). Empty = any comment. Case and accents don't matter, but it has to be the whole word.</li>
          <li>Write the private message (<code>{usuario}</code> inserts the person's @) and 3 or more public replies, one per line: they take turns so Meta doesn't treat it as spam.</li>
          <li>Save. It's checked every 5 minutes and replies 4-9 minutes after the comment.</li>
        </ol>
        <p>What each app supports: <strong>Instagram and Facebook</strong> private message + public reply. <strong>YouTube</strong> public reply only (it has no private messages; max 30 a day because of the quota). <strong>WhatsApp and Telegram</strong> an automatic reply to the message they send you.</p>
        <p>A video's rule beats the general one. Whatever a rule handles is no longer touched by the private-message prayer or the automatic «Amén» in <em>Social</em>: nobody gets two messages. "Once per person" comes ticked; whoever wrote BORRAR/DELETE gets nothing.</p>
        <h3>3. See what happened</h3>
        <p><em>Runs</em> filters by account and status. <strong>Skipped</strong> = they had already received it or asked not to get messages. <strong>Failed</strong> = on comments it retries on its own up to 3 times (chat messages aren't retried: answer them from the Inbox); if it's about permissions, the account rests for 1 hour.</p>
        <h3>4. Switch the Meta app to "Live" (what blocks Instagram and Facebook today)</h3>
        <ol class="steps">
          <li><a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com → My apps</a> → your app → <em>App settings → Basic</em>: fill in the privacy policy URL, the data-deletion URL, the icon, the category and the contact email. Save.</li>
          <li><em>App review → Permissions and features</em>: request <strong>advanced access</strong> for <code>instagram_business_manage_comments</code>, <code>instagram_business_manage_messages</code>, <code>pages_read_user_content</code>, <code>pages_manage_engagement</code> and <code>pages_messaging</code>.</li>
          <li>For each permission, Meta asks what it's for and a short screen recording showing the use (for example: a comment on a Reel → the prayer arrives privately). It may also ask for business verification.</li>
          <li>Once approved (it usually takes days), flip the <strong>App mode</strong> switch at the top of the app from "Development" to "Live".</li>
          <li>Go back to <em>Messages → Overview</em>: the permission error disappears on the next round (within 1 hour).</li>
        </ol>
        <p class="warn">WhatsApp also needs the <code>/webhooks/whatsapp/</code> address to be public on the server so Meta can deliver messages. It's a server configuration change; set it up when you're going to use WhatsApp.</p>`
    },
    {
      slug: 'historia',
      title: 'Instagram story with a link',
      summary: "Upload today's video story with the hidden link in 30 seconds.",
      keywords: 'story instagram link sticker today historia',
      body: `
        <ol class="steps">
          <li>Open <a href="/historia" target="_blank" rel="noopener">/historia</a> on your phone (save it to the home screen).</li>
          <li>Tap <em>Copy link and open Instagram</em> → Instagram → Story.</li>
          <li>🔗 Link sticker → paste. The <code>/hoy</code> link on your dashboard's domain always opens today's video.</li>
          <li>Hide it behind "WATCH THE FULL PRAYER", add your pointing hand and share it.</li>
        </ol>
        <p class="tip">The Instagram API doesn't allow stickers: that's why this part is manual. On Facebook the story goes out on its own.</p>`
    },
    {
      slug: 'libro',
      title: 'The book',
      summary: 'Where it sells, the sales page, the coupon and where it appears.',
      keywords: 'book ebook hotmart sale coupon devotional pdf libro',
      body: `
        <dl class="guide-defs">
          <dt>Sales page</dt><dd>Set in <em>Social → Texts and links</em> (button to the Hotmart checkout).</dd>
          <dt>Coupon</dt><dd>Set in <em>Texts and links</em> and in Hotmart → Coupons.</dd>
          <dt>Where it appears</dt><dd>The footer of every YouTube description, Instagram and Facebook texts, and the Instagram private message.</dd>
          <dt>Regenerate the PDF</dt><dd><code>node scripts/ebook.js</code> (it carries the author's name inside, as Hotmart requires).</dd>
        </dl>`
    },
    {
      slug: 'perfil',
      title: 'Your profile and preferences',
      summary: 'Theme, language, start screen and compact view for each person.',
      keywords: 'profile preferences theme light dark language start compact sign out perfil',
      body: `
        <p>Tap your initials at the top right. Whatever you choose is saved for <strong>your</strong> Google account (each person on the team has their own) and remembered in this browser.</p>
        <dl class="guide-defs">
          <dt>Theme</dt><dd>Dark, light or "like the phone". The menu column stays dark.</dd>
          <dt>Panel language</dt><dd>Spanish or English. Until you choose, it follows your browser.</dd>
          <dt>Start screen</dt><dd>For example <em>Social</em> if that's what you check most.</dd>
          <dt>Compact view</dt><dd>Less space between blocks to see more on a phone.</dd>
        </dl>`
    },
    {
      slug: 'shorts',
      title: 'Verse Shorts',
      summary: 'From a list of references to vertical shorts with music, ready to upload.',
      keywords: 'verses bible psalms batch backgrounds music attribution reina valera versiculos',
      body: `
        <p class="lead">You type the references, press a button and out come vertical shorts (1080×1920) with the verse on screen, the reference below («Salmos capítulo 23, versículo 1») and music. The text is Spanish: it comes from the Reina-Valera 1909.</p>
        <h3>1. Backgrounds</h3>
        <p>In <em>Shorts → Background videos → Upload</em>. Landscapes, sky, water, light. They can be horizontal: they're cropped to vertical automatically. If a short doesn't say which background to use, one is picked at random.</p>
        <p class="warn">Only use videos from <strong>Pexels</strong> or <strong>Pixabay</strong> (free license) or your own. Nothing from Google Images or other channels.</p>
        <h3>2. Music</h3>
        <p>Download tracks from the <strong>YouTube Audio Library</strong> (YouTube Studio → Audio Library) and upload them under <em>Music</em>. If the track says "Attribution required", paste that text in the box below: it will appear in every short's description.</p>
        <h3>3. The batch</h3>
        <p>One short per block; blocks are separated by a <code>---</code> line.</p>
        <pre class="guide-code">Salmos 3:4
---
nombre: confianza
Proverbios 3:5-6
Filipenses 4:13
---
Juan 3:16 | Your own text, if you don't want the 1909 one</pre>
        <ul>
          <li><strong>The reference is enough.</strong> The text comes from the Reina-Valera 1909, which is public domain.</li>
          <li><strong>A range</strong> (<code>Salmos 23:1-3</code>) becomes one screen per verse.</li>
          <li>Writing it in words also works: <code>Juan capítulo 3 versículo 5</code>.</li>
          <li>Optional, at the top of the block: <code>clip: beach.mp4</code>, <code>musica: piano.mp3</code>, <code>nombre: my-short</code>.</li>
          <li>The example buttons add a block at the end of the batch.</li>
        </ul>
        <p class="warn">In <strong>Job 39 to 41</strong> the 1909 Bible numbers verses differently from modern ones: type the text by hand there with <code>|</code>.</p>
        <h3>4. Make and download</h3>
        <p>Press <em>Make all shorts</em>. Each short takes about 20 seconds; you can keep using the panel. In <em>Your shorts</em> each video has <em>Download</em>, <em>Copy title</em> and <em>Copy description</em> (verses, Bible version, attribution and hashtags).</p>
        <h3>5. Upload to YouTube</h3>
        <p>From the YouTube app on your phone: <em>Create → Upload a video</em>, pick the downloaded short, paste the title and description. Since it's vertical and under 3 minutes, YouTube treats it as a Short.</p>
        <p class="tip">Over 60 seconds is allowed, but retention is worse. Two or three verses per short is usually ideal.</p>`
    },
    {
      slug: 'clipping',
      title: 'Clipping for campaigns',
      summary: 'Cut long videos into vertical clips with subtitles and Bible references.',
      keywords: 'clip cut campaign subtitles whisper transcript sermon clipping',
      body: `
        <p class="lead">Clipping campaigns pay per thousand views of the clips you make from their content. Here you upload their video, pick the segment and get a vertical clip with subtitles in time with the voice.</p>
        <h3>Step by step</h3>
        <ol class="steps">
          <li>Download the video the campaign gives you and upload it in <em>Clipping → Upload video</em> (up to 1 GB).</li>
          <li>Type <em>From</em> and <em>To</em> (for example <code>12:30</code> and <code>13:20</code>). Empty = the whole video, capped at 3 minutes.</li>
          <li>Pick the <em>Framing</em>:
            <ul><li><strong>Fill the screen</strong>: crops the sides. Good if the speaker is centered.</li>
            <li><strong>Whole video over a blurred background</strong>: nothing in the frame is lost. Better with several people.</li></ul></li>
          <li>Press <em>Make clip</em>. It transcribes with Whisper: on this server it takes about as long as the segment.</li>
        </ol>
        <h3>What it does on its own</h3>
        <ul>
          <li>Keeps the <strong>original audio</strong> (almost every campaign requires it).</li>
          <li>Puts what's said on screen, 3 words at a time.</li>
          <li>When someone quotes the Bible («Juan 3:16», «Salmos capítulo 23, versículo 1») a card with the reference appears at the top.</li>
        </ul>
        <p class="warn"><strong>Read each campaign's rules.</strong> Some forbid adding music, require a hashtag or a mention, or have a minimum length. Only clip videos you have permission for.</p>
        <p class="tip">The <em>Best</em> quality transcribes names and references better, but takes about 3 times longer.</p>`
    },
    {
      slug: 'revisar',
      title: 'Review and approve videos',
      summary: 'What each status means and what to check before approving.',
      keywords: 'pipeline production statuses approve review quality needs review attention revisar',
      body: `
        <p class="lead">Nothing is published without your review. <em>Pipeline</em> has every video with its status.</p>
        <h3>Statuses</h3>
        <dl class="guide-defs">
          <dt>In production</dt><dd>The agents are still working. If a job fails, in <em>Today</em> you can resume it from the stage that failed.</dd>
          <dt>Needs review</dt><dd>Finished and waiting for your decision.</dd>
          <dt>Needs attention</dt><dd>A quality check didn't pass. Open it to see which one.</dd>
          <dt>Approved / Scheduled</dt><dd>Ready, with a publish date.</dd>
          <dt>Published</dt><dd>It's on YouTube.</dd>
        </dl>
        <h3>Before approving</h3>
        <ul>
          <li>Watch the whole video: voice, images, and that the on-screen text has no mistakes.</li>
          <li>Read the title and description: no made-up facts or promises the video doesn't keep.</li>
          <li>Check the thumbnail, and that the sources and image rights are fine.</li>
          <li>If one scene fails, you can replace it and re-edit without redoing everything.</li>
        </ul>`
    },
    {
      slug: 'cuentas',
      title: 'Accounts and keys',
      summary: 'What each key does, how to test it and how to connect your YouTube channel.',
      keywords: 'accounts keys api key oauth youtube connect channel google cloud openrouter gemini elevenlabs pexels setup cuentas',
      body: `
        <p class="lead">In <em>Accounts</em> you see what's configured and can <strong>really test each connection</strong>. Keys are never shown: at most the last 4 characters, so you know which one it is.</p>
        <h3>Connect the YouTube channel</h3>
        <p>Publishing needs two things:</p>
        <ol class="steps">
          <li><strong>The Google OAuth client</strong> (identifies Oraflow to Google). In <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud → Credentials</a>: <em>Create credentials → OAuth client ID → Web application</em>. Under "Authorized redirect URIs" enter exactly the address shown in <em>Accounts → Replace OAuth client</em>. Paste the ID and the secret and save.</li>
          <li><strong>The channel's permission.</strong> Press <em>Connect channel</em>, sign in with the channel's Google account and accept. You come back to the panel with the channel connected.</li>
        </ol>
        <p class="tip">Then press <em>Test connection</em>: it tells you the exact name of the connected channel. That way you know which channel it will upload to.</p>
        <p class="warn">If you get <strong>invalid_client</strong>: the client ID or secret isn't valid or the client was deleted. Create a new one and paste it. If you get <strong>invalid_grant</strong>: the permission expired; press <em>Connect channel</em> again.</p>
        <h3>The other keys</h3>
        <dl class="guide-defs">
          <dt>YouTube Data API</dt><dd>Read-only public data for Research. It can't publish.</dd>
          <dt>OpenRouter</dt><dd>Writes scripts, titles and descriptions.</dd>
          <dt>Gemini</dt><dd>AI images and video clips.</dd>
          <dt>ElevenLabs</dt><dd>The narrating voice. The test tells you how many characters you've used this month.</dd>
          <dt>Pexels</dt><dd>Free stock photos and videos for the scenes.</dd>
          <dt>Panel API key</dt><dd>Protects the buttons that change things. Setting it is recommended.</dd>
        </dl>
        <p>The ones marked "from .env" are changed on the server, in the <code>.env</code> next to your <code>docker-compose.yml</code>, and then the container is restarted (<code>docker compose up -d</code> in that folder).</p>
        <p class="warn">If a key was ever visible in a screenshot, a chat or a shared file, <strong>rotate it</strong>: create a new one in the service and delete the old one.</p>`
    },
    {
      slug: 'buscador',
      title: 'Search and keyboard shortcuts',
      summary: 'Find videos, shorts, guides and actions from any screen.',
      keywords: 'search finder shortcuts keyboard ctrl k commands buscador',
      body: `
        <p class="lead">Search (<kbd>Ctrl</kbd> <kbd>K</kbd>, <kbd>/</kbd> or the magnifier at the top) finds screens, actions, your videos, ideas, finished shorts and these guides.</p>
        <ul>
          <li>Accents and capitals don't matter: «oracion» finds «Oración».</li>
          <li>Several words in any order: «salmo mañana».</li>
          <li>It works in Spanish and English: «configuración» or «setup».</li>
        </ul>
        <h3>Shortcuts</h3>
        <dl class="guide-defs keys">
          <dt><kbd>Ctrl</kbd> <kbd>K</kbd> · <kbd>/</kbd></dt><dd>Open search</dd>
          <dt><kbd>N</kbd></dt><dd>Create video</dd>
          <dt><kbd>G</kbd> then <kbd>O</kbd></dt><dd>Today</dd>
          <dt><kbd>G</kbd> then <kbd>V</kbd></dt><dd>Verse Shorts</dd>
          <dt><kbd>G</kbd> then <kbd>K</kbd></dt><dd>Clipping</dd>
          <dt><kbd>G</kbd> then <kbd>P</kbd></dt><dd>Pipeline</dd>
          <dt><kbd>G</kbd> then <kbd>C</kbd></dt><dd>Calendar</dd>
          <dt><kbd>G</kbd> then <kbd>A</kbd></dt><dd>Analytics</dd>
          <dt><kbd>G</kbd> then <kbd>U</kbd></dt><dd>Accounts</dd>
          <dt><kbd>G</kbd> then <kbd>H</kbd></dt><dd>Guides</dd>
          <dt><kbd>Ctrl</kbd> <kbd>S</kbd></dt><dd>Save the shorts batch while typing</dd>
        </dl>`
    },
    {
      slug: 'derechos',
      title: 'Rules to keep your channel',
      summary: 'Copyright, reused content and multiple channels.',
      keywords: 'copyright strike content id reused monetization channels derechos',
      body: `
        <p class="lead">A channel can be lost in weeks over copyright. These rules avoid almost every problem.</p>
        <ul>
          <li><strong>Backgrounds:</strong> Pexels, Pixabay or your own. <strong>Music:</strong> the YouTube Audio Library or licensed. <strong>Clips:</strong> only from campaigns that give you permission, or your own.</li>
          <li><strong>Don't re-upload other channels' videos</strong> even with added music or text: the Content ID claim comes, then the strike. With 3 strikes the channel is closed.</li>
          <li><strong>Reused content:</strong> YouTube doesn't monetize channels that just stitch together other people's material with little of their own.</li>
          <li><strong>Several channels:</strong> if one goes down over strikes, YouTube can close every channel related to you.</li>
          <li><strong>Bibles:</strong> the Reina-Valera 1909 is public domain. The RVR1960 and the NVI are copyrighted.</li>
          <li><strong>The Chosen</strong> and other series: only if their owners allow it in writing.</li>
        </ul>`
    },
    {
      slug: 'problemas',
      title: 'Troubleshooting',
      summary: "What to do when something doesn't come out.",
      keywords: 'error fail problem not working upload slow help problemas',
      body: `
        <dl class="guide-defs">
          <dt>"Not available" in Shorts or Clipping</dt><dd>The project folder isn't mounted in the container. Check <code>SHORTS_DIR</code> and the <code>/shorts</code> volume in <code>docker-compose.yml</code>.</dd>
          <dt>The upload fails</dt><dd>Limits: backgrounds 300 MB, music 40 MB, clipping videos 1 GB. With large files, use wifi and don't close the tab.</dd>
          <dt>The job ends "with errors"</dt><dd>Look at the <em>Progress</em> box: it says which short failed and why (a reference that doesn't exist, a line without text…). The rest are made anyway.</dd>
          <dt>"… was not found in the Bible"</dt><dd>Check the book name and the numbers. For another text use <code>reference | text</code>.</dd>
          <dt>The clip takes a long time</dt><dd>Normal: it transcribes on the server's CPU. Use the <em>Fast</em> quality or a shorter segment.</dd>
          <dt>It asks for an "API key"</dt><dd>It's the <code>API_KEY</code> from the server's <code>.env</code>. It's stored in this browser only.</dd>
          <dt>YouTube: invalid_client / invalid_grant</dt><dd>See <a href="#" data-guide-link="cuentas">Accounts and keys</a>.</dd>
        </dl>`
    }
  ];
})();
