import TelegramBot from 'node-telegram-bot-api'
import web3, { Keypair } from "@solana/web3.js";
import tweetnacl from 'tweetnacl'
import { readFileSync, writeFile, writeFileSync } from 'fs';

const token = ''; // Get a bot token from @botfather
const bot = new TelegramBot(token, { polling: true });
const main_wallet = "" // wallet address where you will invite refferals.
const ref_code = ""

const main_menu = {
    reply_markup: JSON.stringify({
        keyboard: [
            ['Add a new Bot', 'Start unstarted'],
            ['Set refferal code', 'Status'],
        ]
    })
};

interface Account {
    private_key: string,
    is_mining: boolean
}

interface User {
    accounts: Account[],
    ref_code: string
}

interface State {
    users: Partial<{
        [key: string]: User
    }>
}

const state: State = JSON.parse(readFileSync('./accounts.json').toString())

const get_signature = async (keyPair: Keypair): Promise<{ address: string; signature: string; timestamp: number; }> => {
    const address = keyPair.publicKey.toBase58();
    const bufSecretKey = keyPair.secretKey;
    const timestamp = Math.floor(Date.now() / 1000);
    const serializedData = Buffer.from("sign in" + timestamp);
    const bufSig = tweetnacl.sign(serializedData, bufSecretKey);
    const signature = Buffer.from(bufSig).toString('hex').substr(0, 128);

    return {
        address,
        signature,
        timestamp,
    };
}

function gen_rand_num(from: number, to: number): number {
    if (from > to) throw new Error("Parameter \"From\" can't be more than \"To\"");

    return (Math.floor(Math.random() * (to - from) + from))
}

function sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms));
}

const signer = async (key_pair: Keypair, is_init = false) => {
    const date = (new Date);
    let correction = ((24 - date.getUTCHours()) * 60 + (60 - date.getUTCMinutes())) * 60 * 1000;

    is_init && await sleep(gen_rand_num(0, 30 * 60) * 1000)
    while (true) {
        const { address, signature, timestamp } = await get_signature(key_pair);

        const res = await (await fetch("https://api.v-token.io/api/points/sign", {
            "headers": {
                "accept": "application/json, text/plain, */*",
                "content-type": "application/json",
            },
            "body": JSON.stringify({ sign: signature, address, timestamp }),
            "method": "POST",
        })).json() as any;

        console.log(address, res);

        const random_num = gen_rand_num(0, 1000 * 60 * 60 * 23);
        const current_date = (new Date);
        correction = ((24 - current_date.getUTCHours()) * 60 + (60 - current_date.getUTCMinutes())) * 60 * 1000

        await sleep(random_num + correction)
    }
}

bot.on('message', async (msg) => {
    try {
        const chat_id = msg.chat.id;
        if (!state.users[chat_id]) {
            state.users[chat_id] = { accounts: [], ref_code }
        }
        const user = state.users[chat_id]
        // console.log(msg);

        switch (msg.text) {
            case "/start":
                bot.sendMessage(chat_id, 'Good evening. Ref code defaults to ' + ref_code + '. Any message that is not a button will be identified as new ref code.', { ...main_menu, reply_to_message_id: msg.message_id } as any);
                break;

            case "Add a new Bot":
                const key_pair = web3.Keypair.generate();
                const account = { private_key: Buffer.from(key_pair.secretKey).toString("hex"), is_mining: false }
                user!.accounts.push(account)
                writeFileSync('./accounts.json', JSON.stringify(state, (key, value) => {
                    if (key == "is_mining") {
                        return false
                    } else return value
                }, 2));
                bot.sendMessage(chat_id, `Added a new bot.  Address: ${key_pair.publicKey.toBase58()}`)
                bot.sendMessage(chat_id, `Registering it with ref code: ${user?.ref_code}`)
                const invite = await (await fetch("https://api.v-token.io/api/points/invite", {
                    "headers": {
                        "accept": "application/json, text/plain, */*",
                        "accept-language": "en-US,en;q=0.8",
                        "content-type": "application/json",
                    },
                    "body": JSON.stringify({ invite_code: user?.ref_code, address: key_pair.publicKey.toBase58() }),
                    "method": "POST",
                })).json()
                bot.sendMessage(chat_id, `Invited account with response: ${JSON.stringify(invite)}.  Starting the sign function`);
                account.is_mining = true;
                signer(key_pair);
                break;

            case "Start unstarted":
                let i = 0;
                for (const account of user!.accounts) {
                    if (!account.is_mining) {
                        account.is_mining = true;
                        signer(Keypair.fromSecretKey(Buffer.from(account.private_key, "hex")), true);
                        i++;
                    }
                }
                bot.sendMessage(chat_id, `Started signing on ${i} accounts`)
                break;

            case "Status":
                const res = await (await fetch("https://api.v-token.io/api/points/home?address=" + main_wallet, {
                    "headers": {
                        "accept": "application/json, text/plain, */*",
                        "accept-language": "en-US,en;q=0.8",
                    },
                })).json() as any;
                delete (res.data.points_data)
                delete (res.data.refferal_code)
                delete (res.data.refferal_code)

                bot.sendMessage(chat_id, JSON.stringify(res.data) + "\n" + ` You have ${user?.accounts.length} refferals`)
                break;

            default:
                if (msg.text) {
                    user!.ref_code = msg.text;
                    bot.sendMessage(chat_id, "Ref code is set to: " + msg.text);
                }
                break;
        }
    } catch (e) {
        console.log("BEEEEEEEEEEEEEEEEEEEE", e);

    }
});