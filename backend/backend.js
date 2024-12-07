// backend.js
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { createLogger, format, transports } from 'winston';
import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Connection, PublicKey } from '@solana/web3.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.simple()
  ),
  transports: [
    new transports.Console()
  ]
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  logger.error("OPENAI_API_KEY not set. Please set it before running.");
  process.exit(1);
}

// Constants
const REQUIRED_TOKENS = 200000;
const CYRUS_MINT_ADDRESS = new PublicKey("4oJh9x5Cr14bfaBtUsXN1YUZbxRhuae9nrkSyWGSpump");
const RPC_ENDPOINT = "https://api.mainnet-beta.solana.com";

// Setup Solana connection
const connection = new Connection(RPC_ENDPOINT, "confirmed");

// In-memory storage
// usersData[publicKey] = { agents: [ {id, email, username, password, character, running, logs:[] } ] }
const usersData = {};
const agentProcesses = {}; 

// Real token check function
async function checkUserTokenBalance(publicKeyStr) {
  try {
    const ownerPubKey = new PublicKey(publicKeyStr);
    const parsedTokenAccounts = await connection.getParsedTokenAccountsByOwner(ownerPubKey, {
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
    });

    const tokenAccount = parsedTokenAccounts.value.find(
      acc => acc.account.data.parsed.info.mint === CYRUS_MINT_ADDRESS.toBase58()
    );

    if (!tokenAccount) {
      // No account for CYRUS token
      return false;
    }

    const uiAmount = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount;
    return uiAmount >= REQUIRED_TOKENS;
  } catch (error) {
    logger.error("Error checking token balance:", error);
    return false;
  }
}

// Puppet code with gpt-3.5-turbo
const puppetCode = `
// agent-runner.js
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
const MODEL_NAME = 'gpt-3.5-turbo';
const INTERACTION_INTERVAL = {
    MIN: 60 * 1000,    // 1 minute
    MAX: 180 * 1000    // 3 minutes
};

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
      "Authorization": \`Bearer \${OPENAI_API_KEY}\`
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
    throw new Error(\`OpenAI API error: \${txt}\`);
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
        'v': '𝚟', 'w': '𝚠', 'x': '𝚡', 'y': '𝚒', 'z': '𝚣'
    };
    return text.split('').map(char => serifMap[char] || char).join('');
}

async function generateGlyphSymbol() {
    const glyphs = ['☉', '☽', '☿', '♀', '♂', '♃', '♄', '⚕', '☤', '☯', '☮', '⚛'];
    return glyphs[Math.floor(Math.random() * glyphs.length)];
}

async function generateTweet() {
    const prompt = "Write a single complete sentence (100-250 chars) about a philosophical insight on life, adding some mysterious symbol. The persona is " + CHARACTER;
    const tweet = await callOpenAI(prompt);
    return toSerif(tweet);
}

async function generateResponse(tweetContent, userHandle) {
    const prompt = \`Write a single complete sentence (100-250 chars) responding to \${userHandle}'s tweet: "\${tweetContent}". Connect it to personal criticism. Persona: \${CHARACTER}\`;
    let response = await callOpenAI(prompt);
    if (!response.match(/[.!?]$/)) {
        response += '.';
    }

    if (Math.random() < 0.1) {
        const glyph = await generateGlyphSymbol();
        response = \`\${glyph} \${response}\`;
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
        await page.goto(TWITTER_URL, { waitUntil: 'networkidle2', timeout: 60000 });
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

// We do not call mainLoop here. It's controlled by the parent process (the backend).
`;

const agentRunnerPath = path.join(__dirname, 'agent-runner.js');
if (!fs.existsSync(agentRunnerPath)) {
  fs.writeFileSync(agentRunnerPath, puppetCode, 'utf8');
}

function startAgentProcess(agent) {
  const child = spawn('node', [agentRunnerPath], {
    env: {
      ...process.env,
      TWITTER_EMAIL: agent.email,
      TWITTER_USERNAME: agent.username,
      TWITTER_PASSWORD: agent.password,
      AGENT_CHARACTER: agent.character,
      OPENAI_API_KEY: OPENAI_API_KEY
    }
  });

  const logs = agent.logs;
  child.stdout.on('data', (data) => {
    const line = data.toString().trim();
    logs.push(`[${new Date().toISOString()}] ${line}`);
    if (logs.length > 500) logs.shift();
  });

  child.stderr.on('data', (data) => {
    const line = data.toString().trim();
    logs.push(`[${new Date().toISOString()}] ERROR: ${line}`);
    if (logs.length > 500) logs.shift();
  });

  child.on('exit', (code) => {
    logs.push(`[${new Date().toISOString()}] Process exited with code ${code}`);
  });

  agentProcesses[agent.id] = { process: child, logs };
}

function stopAgentProcess(agentId) {
  const entry = agentProcesses[agentId];
  if (entry && entry.process && !entry.process.killed) {
    entry.process.kill('SIGINT');
  }
  delete agentProcesses[agentId];
}

// Express App
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/checkTokens', async (req, res) => {
  const { publicKey } = req.query;
  if (!publicKey) return res.status(400).json({ error: 'Missing publicKey' });

  const hasTokens = await checkUserTokenBalance(publicKey);
  if (hasTokens) {
    if (!usersData[publicKey]) {
      usersData[publicKey] = { agents: [] };
    }
    return res.json({ eligible: true });
  } else {
    return res.json({ eligible: false });
  }
});

app.post('/api/createAgent', (req, res) => {
  const { publicKey, email, username, password, character } = req.body;
  if (!publicKey || !email || !username || !password || !character) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const user = usersData[publicKey];
  if (!user) return res.status(403).json({ error: 'Not authorized' });
  if (user.agents.length >= 3) return res.status(400).json({ error: 'Max agents reached' });

  const agentId = uuidv4();
  const newAgent = { id: agentId, email, username, password, character, running: false, logs: [] };
  user.agents.push(newAgent);
  return res.json({ success: true, agent: newAgent });
});

app.post('/api/updateAgent', (req, res) => {
  const { publicKey, agentId, email, username, password, character } = req.body;
  if (!publicKey || !agentId) return res.status(400).json({ error: 'Missing publicKey or agentId' });

  const user = usersData[publicKey];
  if (!user) return res.status(403).json({ error: 'Not authorized' });

  const agent = user.agents.find(a => a.id === agentId);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  if (email) agent.email = email;
  if (username) agent.username = username;
  if (password) agent.password = password;
  if (character) agent.character = character;

  return res.json({ success: true, agent });
});

app.post('/api/deleteAgent', (req, res) => {
  const { publicKey, agentId } = req.body;
  if (!publicKey || !agentId) return res.status(400).json({ error: 'Missing publicKey or agentId' });

  const user = usersData[publicKey];
  if (!user) return res.status(403).json({ error: 'Not authorized' });

  const idx = user.agents.findIndex(a => a.id === agentId);
  if (idx === -1) return res.status(404).json({ error: 'Agent not found' });

  const agent = user.agents[idx];
  if (agent.running) {
    stopAgentProcess(agentId);
  }

  user.agents.splice(idx, 1);
  return res.json({ success: true });
});

app.post('/api/startAgent', (req, res) => {
  const { publicKey, agentId } = req.body;
  if (!publicKey || !agentId) return res.status(400).json({ error: 'Missing publicKey or agentId' });

  const user = usersData[publicKey];
  if (!user) return res.status(403).json({ error: 'Not authorized' });

  const agent = user.agents.find(a => a.id === agentId);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  if (agent.running) return res.json({ success: true, message: 'Already running' });

  agent.running = true;
  agent.logs.push(`[${new Date().toISOString()}] Agent started.`);
  startAgentProcess(agent);
  return res.json({ success: true });
});

app.post('/api/stopAgent', (req, res) => {
  const { publicKey, agentId } = req.body;
  if (!publicKey || !agentId) return res.status(400).json({ error: 'Missing publicKey or agentId' });

  const user = usersData[publicKey];
  if (!user) return res.status(403).json({ error: 'Not authorized' });

  const agent = user.agents.find(a => a.id === agentId);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  if (!agent.running) return res.json({ success: true, message: 'Already stopped' });

  agent.running = false;
  agent.logs.push(`[${new Date().toISOString()}] Agent stopped.`);
  stopAgentProcess(agentId);

  return res.json({ success: true });
});

app.get('/api/getAgents', (req, res) => {
  const { publicKey } = req.query;
  if (!publicKey) return res.status(400).json({ error: 'Missing publicKey' });

  const user = usersData[publicKey];
  if (!user) return res.status(403).json({ error: 'Not authorized' });

  return res.json({ agents: user.agents });
});

app.get('/api/getAgentLogs', (req, res) => {
  const { publicKey, agentId } = req.query;
  if (!publicKey || !agentId) return res.status(400).json({ error: 'Missing publicKey or agentId' });

  const user = usersData[publicKey];
  if (!user) return res.status(403).json({ error: 'Not authorized' });

  const agent = user.agents.find(a => a.id === agentId);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  return res.json({ logs: agent.logs });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Backend running on http://localhost:${PORT}`);
});
