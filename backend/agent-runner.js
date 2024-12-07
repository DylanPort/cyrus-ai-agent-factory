
// agent-runner.js
// Adapted puppeteer code to use environment variables and OpenAI GPT-4.
// This code will run in a loop until killed.
// It will log actions and tweets to stdout.

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { createLogger, format, transports } from 'winston';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
dotenv.config();
puppeteer.use(StealthPlugin());

const TWITTER_URL = 'https://twitter.com/i/flow/login';
const EMAIL = process.env.TWITTER_EMAIL;
const PASSWORD = process.env.TWITTER_PASSWORD;
const USERNAME = process.env.TWITTER_USERNAME;
const CHARACTER = process.env.AGENT_CHARACTER || 'mysterious persona';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL_NAME = 'gpt-4';
const INTERACTION_INTERVAL = {
    MIN: 60 * 1000,    // 1 minute minimum
    MAX: 180 * 1000    // 3 minutes maximum
};

// Setup logger
const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.simple()
    ),
    transports: [ new transports.Console() ]
});

async function callOpenAI(prompt) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: 'POST',
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.9
    })
  });
  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`OpenAI API error: ${txt}`);
  }
  const json = await response.json();
  return json.choices[0].message.content.trim();
}

function toSerif(text) {
    const serifMap = {
        'A': '𝙰', 'B': '𝙱', 'C': '𝙲', 'D': '𝙳', 'E': '𝙴', 'F': '𝙵', 'G': '𝙶', 
        'H': '𝙷', 'I': '𝙸', 'J': '𝙹', 'K': '𝙺', 'L': '𝙻', 'M': '𝙼', 'N': '𝙽', 
        'O': '𝙾', 'P': '𝙿', 'Q': '𝚀', 'R': '𝚁', 'S': '𝚂', 'T': '𝚃', 'U': '𝚄', 
        'V': '𝚅', 'W': '𝚆', 'X': '𝚇', 'Y': '𝚈', 'Z': '𝚉',
        'a': '𝚊', 'b': '𝚋', 'c': '𝚌', 'd': '𝚍', 'e': '𝚎', 'f': '𝚏', 'g': '𝚐', 
        'h': '𝚑', 'i': '𝚒', 'j': '𝚓', 'k': '𝚔', 'l': '𝚕', 'm': '𝚖', 'n': '𝚗', 
        'o': '𝚘', 'p': '𝚙', 'q': '𝚚', 'r': '𝚛', 's': '𝚜', 't': '𝚝', 'u': '𝚞', 
        'v': '𝚟', 'w': '𝚠', 'x': '𝚡', 'y': '𝚢', 'z': '𝚣'
    };

    return text.split('').map(char => serifMap[char] || char).join('');
}

async function generateGlyphSymbol() {
    const glyphs = ['☉', '☽', '☿', '♀', '♂', '♃', '♄', '⚕', '☤', '☯', '☮', '⚛'];
    return glyphs[Math.floor(Math.random() * glyphs.length)];
}

async function generateTweet() {
    // Use CHARACTER in prompt
    const prompt = "Write a single complete sentence (100-250 chars) about a philosophical insight on life, adding some mysterious symbol. The persona is " + CHARACTER;
    const tweet = await callOpenAI(prompt);
    return toSerif(tweet);
}

async function generateResponse(tweetContent, userHandle) {
    const prompt = `Write a single complete sentence (100-250 chars) responding to ${userHandle}'s tweet: "${tweetContent}". Connect it to personal criticism. Persona: ${CHARACTER}`;
    let response = await callOpenAI(prompt);
    if (!response.match(/[.!?]$/)) {
        response += '.';
    }

    if (Math.random() < 0.1) {
        const glyph = await generateGlyphSymbol();
        response = `${glyph} ${response}`;
    }

    response = toSerif(response);
    if (response.length < 100) {
        return await generateResponse(tweetContent, userHandle);
    }
    return response.substring(0, 250);
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function login(page) {
    try {
        logger.info('Starting login process...');
        await page.goto(TWITTER_URL, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        await sleep(2000);

        await page.waitForSelector('input[autocomplete="username"]', { visible: true, timeout: 30000 });
        await page.type('input[autocomplete="username"]', EMAIL, { delay: 150 });
        await sleep(1000);
        await page.keyboard.press('Enter');
        await sleep(2000);

        try {
            const usernameInput = await page.$('input[data-testid="ocfEnterTextTextInput"]');
            if (usernameInput) {
                await usernameInput.type(USERNAME, { delay: 150 });
                await page.keyboard.press('Enter');
                await sleep(2000);
            }
        } catch (e) {}

        await page.waitForSelector('input[name="password"]', { visible: true, timeout: 30000 });
        await page.type('input[name="password"]', PASSWORD, { delay: 150 });
        await sleep(1000);

        await page.keyboard.press('Enter');
        await sleep(5000);

        const success = await Promise.race([
            page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 20000 }).then(() => true),
            page.waitForSelector('[data-testid="AppTabBar_Home_Link"]', { timeout: 20000 }).then(() => true),
            page.waitForSelector('[aria-label="Home"]', { timeout: 20000 }).then(() => true),
            sleep(20000).then(() => false)
        ]);

        logger.info("Login success: " + success);
        return success;

    } catch (error) {
        logger.error("Login error: " + error.message);
        return false;
    }
}

async function postTweet(page, content) {
    try {
        const composeSelector = '[data-testid="SideNav_NewTweet_Button"]';
        await page.waitForSelector(composeSelector, { visible: true, timeout: 5000 });
        await page.click(composeSelector);
        await sleep(1500);

        const textboxSelector = '[data-testid="tweetTextarea_0"]';
        await page.waitForSelector(textboxSelector, { visible: true, timeout: 5000 });
        await page.click(textboxSelector);
        await page.keyboard.type(content, { delay: 100 });
        await sleep(1000);

        const postButtonSelector = '[data-testid="tweetButton"]';
        await page.waitForSelector(postButtonSelector, { visible: true, timeout: 5000 });
        await page.click(postButtonSelector);

        await sleep(2000);
        logger.info('Tweet posted successfully');
        return true;
    } catch (error) {
        logger.error("Error posting tweet: " + error.message);
        return false;
    }
}

async function interactWithTimeline(page) {
    try {
        await page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
        await sleep(2000);
        
        await page.evaluate(() => {
            window.scrollBy({
                top: Math.random() * 1000,
                behavior: 'smooth'
            });
        });
        await sleep(2000);

        const tweets = await page.$$('[data-testid="tweet"]');
        
        for (const tweet of tweets.slice(0, 8)) {
            if (Math.random() < 0.6) {
                try {
                    const tweetText = await tweet.$eval('[data-testid="tweetText"]', el => el.textContent);
                    const userHandle = await tweet.$eval('[data-testid="User-Name"] a', el => el.textContent);
                    
                    const shouldLike = Math.random() < 0.7;
                    const shouldReply = Math.random() < 0.5;

                    if (shouldLike) {
                        const likeButton = await tweet.$('[data-testid="like"]');
                        if (likeButton) {
                            await likeButton.click();
                            await sleep(800);
                        }
                    }

                    if (shouldReply) {
                        const response = await generateResponse(tweetText, userHandle);
                        if (response) {
                            const replyButton = await tweet.$('[data-testid="reply"]');
                            if (replyButton) {
                                await replyButton.click();
                                await sleep(1000);
                                
                                const replyBox = await page.waitForSelector('[data-testid="tweetTextarea_0"]');
                                await replyBox.type(response, { delay: 100 });
                                await sleep(1000);
                                
                                const replySubmit = await page.$('[data-testid="tweetButton"]');
                                if (replySubmit) await replySubmit.click();
                            }
                        }
                    }
                    
                    await sleep(1500);
                } catch (e) {
                    logger.error("Error processing tweet: " + e.message);
                    continue;
                }
            }
        }
    } catch (error) {
        logger.error("Error interacting with timeline: " + error.message);
    }
}

async function mainLoop() {
    while (true) {
        const browser = await puppeteer.launch({
            headless: "new",
            defaultViewport: { width: 1920, height: 1080 },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1920,1080'
            ]
        });

        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            const loginSuccess = await login(page);
            if (!loginSuccess) throw new Error('Login failed');

            while (true) {
                try {
                    const action = Math.random();
                    
                    if (action < 0.7) {
                        const tweet = await generateTweet();
                        if (tweet) {
                            await postTweet(page, tweet);
                        }
                    } else {
                        await interactWithTimeline(page);
                    }

                    const delay = Math.floor(Math.random() * (INTERACTION_INTERVAL.MAX - INTERACTION_INTERVAL.MIN + 1) + INTERACTION_INTERVAL.MIN);
                    logger.info(`Waiting ${Math.floor(delay/1000)} seconds before next action...`);
                    await sleep(delay);

                    if (Math.random() < 0.2) {
                        logger.info('Refreshing page...');
                        await page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
                        await sleep(3000);
                    }
                } catch (error) {
                    logger.error("Action cycle error: " + error.message);
                    await sleep(30000);
                }
            }
        } catch (error) {
            logger.error("Main loop error: " + error.message);
            await sleep(60000);
        } finally {
            await browser.close();
        }

        logger.info('Restarting browser session...');
        await sleep(5000);
    }
}

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

mainLoop().catch(error => {
    console.error("Fatal error starting bot: " + error.message);
});
