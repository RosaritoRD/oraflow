# 💸 Savings and tips

What we did to keep Oraflow cheap to run every month, and what we learned to make the videos perform better. Everything here was tested on a real channel that publishes daily.

---

## Part 1 · Spend less

### 1. Don't pay for the voice of a video that won't be published
Before narrating, Oraflow checks whether the title already exists on the channel. If it's a repeat, the script is rewritten **before** spending voice credits.
→ duplicate-title check in `index.js` and `database/db.js`.

### 2. A cheaper voice model only where it's least noticeable
`ELEVENLABS_TTS_MODEL_SHORT=eleven_flash_v2_5` uses the *flash* model (roughly half the credits) only for Shorts, while long videos stay on `multilingual_v2`.
⚠️ **Measure it before you lock it in.** On our channel, Shorts retention dropped when we turned it on, and we're checking it with a one-week test. Saving on voice isn't worth it if the video gets watched less.

### 3. Shorter long videos
Going from 6–8 to **5–6 minutes** per long video cuts voice, rendering and storage without changing the format.
→ `DEFAULT_VIDEO_LENGTH=5-6 minutes`

### 4. Render on your PC, not on the server
The heavy FFmpeg work can run on a home computer (the "workshop"). If the PC doesn't answer, the server does it on its own. That way a small, cheap VPS is enough.
→ `pc/taller/` and `FFMPEG_REMOTO_URL`

### 5. Local AI for repetitive tasks
Comment analysis uses **qwen3:8b with Ollama** on your PC, and only falls back to the cloud if the PC is off. Scripts stay in the cloud, where quality shows.
→ `LOCAL_LLM_URL`, `LOCAL_LLM_MODEL`

### 6. Free local voice *(not wired in yet)*
There's a client for local voice with Kokoro or Piper (`utils/local-tts-client.js`). It works in testing, but **it's not hooked into production yet**. See `docs/local-voice.md` and [voz-local](https://github.com/RosaritoRD/local-voice).

### 7. Images and video without paying per item
- `VIDEO_PROVIDER=slideshow`: landscapes and photos with motion instead of AI-generated video, which is the most expensive option.
- Backgrounds from **Pexels** (free with a key) and your own rotating collection (`utils/background-picker.js`).
- `THUMBNAIL_AI=off`: thumbnails from templates and your own library; image AI is only used if you turn it on.
- `IMAGE_QUALITY=medium` when image AI is used.

### 8. Don't redo what's already done
- **Shot cache:** changing one scene no longer re-renders the whole video.
- **Narration cache:** the same text with the same voice is never paid for twice.
- A reusable **clip library**, with daily disk cleanup.

### 9. Protect YouTube's free quota
The YouTube API has a daily limit. Oraflow reserves quota for uploads, keeps automatic YouTube replies off until you turn them on, and warns you when the quota runs out instead of failing silently.

---

## Part 2 · Make it perform better

### 1. Retention is the metric that rules Shorts
A Short's views depend on how many people watch it to the end, or more than once. Oraflow stores each video's retention at 24 h and 7 days. **Look at it before changing anything.** On our channel, Shorts above 130% retention got 2–3× more views.

### 2. Titles that name a situation, not a topic
*"Oración de la noche cuando no puedes dejar de pensar"* ("Night prayer for when you can't stop thinking") or *"Si despertaste con ansiedad, haz esta oración"* ("If you woke up anxious, say this prayer") work better than *"Oración de la mañana para paz y esperanza"* ("Morning prayer for peace and hope"). The scriptwriter already learns from your most-viewed Shorts (`utils/shorts-que-funcionan.js`).

### 3. The first second is an image, not a problem
*"If you turn off the light and your worries stay awake…"* hooks better than opening with *"If work and bills…"*.

### 4. Ask for one single thing at the end
"Type *Amén* in the comments" is short and direct. Videos that asked for it got dozens of comments; the ones that didn't got almost none. Set it in the channel profile (dashboard → Canal → call to action).

### 5. No dates in long-video titles
"ORACIÓN DE LA MAÑANA · 15 DE OCTUBRE" looks expired the next day. Use `TITLE_DATE=off`.

### 6. Change one thing at a time
If you change the voice, the thumbnail and the title at once, you won't know which one worked. Run one-week tests with a single change and compare against the previous week. The dashboard's *Growth Experiments Studio* does this with titles and thumbnails.

---

Got another trick to save money or perform better? Open an issue or a PR.
📖 More guides at **[keizactech.com/docs](https://keizactech.com/docs)**
