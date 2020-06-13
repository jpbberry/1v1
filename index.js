const Discord = require("discord.js");
let client = new Discord.Client();
client.config = require("./config.js");
let yes;
let no;
let g;
let timeout = 600000;
let p1 = "🅰"
let p2 = "🅱"
let warn = "⚠";
var lvlMatch = /^\[[0-9]+\]/gi;
let matches;
let cat;
const yarg = require("yargs-parser");
const { Queue } = require("./structs/queue.js");
client.devmode = false;


const rethink = require("rethinkdbdash");

const db = rethink({
    port: 28015,
    host: "localhost",
    db: "fortnut",
    silent: false,
    discovery: true
})

function d(time) {
    return function(msg) {
        if (msg)
            setTimeout(() => {
                msg.delete()
            }, time);
    }
}

function parseMention(mention) {
    if (!mention) return;

    if (mention.startsWith('<@') && mention.endsWith('>')) {
        mention = mention.slice(2, -1);

        if (mention.startsWith('!')) {
            mention = mention.slice(1);
        }

        return client.users.get(mention);
    }
}
client.on("ready", () => {
    console.log("Online and ready!");
    client.user.setActivity(
        "Your 1v1's", {
            type: "WATCHING"
        }
    )
    yes = client.emojis.get("598553289872900122");
    no = client.emojis.get("598554771003015229");
    g = client.guilds.get("565906200059838468");
    matches = client.channels.get("598609076943061003");
    cat = client.channels.get("598623494313476155");
    client.games = new Discord.Collection();


    client.db = db;

    client.__defineGetter__("embed", () => {
        return new Discord.MessageEmbed();
    })
    client.channels.get("599374534017155112").messages.fetch("603621788533915658")
        .then(x => {
            console.log("fetch")
            x.reactions.removeAll().then(oof => {
                console.log("removed")
                x.react("🎟").then(x => {
                    console.log("reacted")
                })
            })
            client.queue = new Queue(client, x.guild, x, client.channels.get("599376824841142349"));
        })
})

client.Game = require("./structs/game.js");


function findGame(user1, user2) {
    return client.games.find(x => {
        return (
            [x.sender.user.id, x.receiver.user.id].includes(user1.id) || [x.sender.user.id, x.receiver.user.id].includes(user2.id)
        )
    });
}

function findGameByText(channel) {
    return client.games.find(x => {
        return x.matchText.id === channel.id;
    });
}

client.on("message", async(message) => {
    if (!message.content.startsWith("1v1") && !message.content.startsWith("points")) return;
    var gdb = db.table(message.guild.id);
    if (!gdb) return;
    let args = yarg(message.content);
    if (message.content.startsWith("1v1 <") && message.mentions.users.first()) {
        if (client.devmode) return message.reply("Bot is currently in dev mode! Please try again in a bit!");
        message.delete();
        var receiver = message.mentions.users.first();
        if (args.force || args.f) {
            if (!message.member.hasPermission("MANAGE_MESSAGES")) return message.reply("You don't have permission to run this command.").then(d(2000));
            if (!receiver) return message.reply("Missing user").then(d(2000));
            var user2 = message.mentions.users.first(2)[1] || message.author;

            return createNewGame(user2, receiver, message.guild);
        }
        if (receiver.bot || receiver.equals(message.author)) return message.reply("Just no.").then(d(2000))
        if (findGame(message.author, receiver)) return message.reply("You or this user are already in a fight! Cannot challenge.").then(d(2000));

        client.games.set(message.author.id + receiver.id, new client.Game(
            client,
            message.author,
            receiver,
            message.guild,
            gdb,
            message,
            false
        ));

    }
    if (message.content.startsWith("1v1 end")) {
        if (args.force || args.f) {
            if (!message.member.hasPermission("MANAGE_MESSAGES")) return message.reply("You don't have permission to run this command.").then(d(2000));
            var game = findGameByText(message.channel);
            if (!game) return message.reply("Invalid game channel!").then(d(2000));
            return game.skipTo("endMatch");
        }
        if (args.d || args.deadly) {
            if (!message.member.hasPermission("MANAGE_MESSAGES")) return message.reply("You don't have permission to run this command.").then(d(2000));
            var game = findGameByText(message.channel);
            if (!game) return message.reply("Not a game channel or invalid game instance").then(d(2000));
            message.reply("Destroying match...");
            game.clearRoom(true);
            return game.destroyMatch();
        }
        if (args.winner || args.w) {
            if (!message.member.hasPermission("MANAGE_MESSAGES")) return message.reply("You don't have permission to run this command.").then(d(2000));
            var person = parseMention(args.winner || args.w);
            if (!person) return;
            var game = findGame(person, person);
            var pID = game.sender.user.id == person.id ? 1 : 2;
            game.winner = pID;
            game.skipTo("handleWinner");
            game.clearRoom(true);
        }
        var game = findGame(message.author, message.author);
        if (!game) return message.reply("You're not in a game!").then(d(2000));
        game.skipTo("endMatch");
    }

    if (message.content == "1v1 devmode") {
        if (message.author.id !== "142408079177285632") return message.reply("only the dev can run this command");
        client.devmode = true;
        message.delete();
        message.reply(":ok_hand:").then(d(2000));
    }
    if (message.content.startsWith("points")) {
        message.delete();
        var user = message.mentions.users.first() || message.author;
        var dat = await gdb.get(user.id).run();
        if (args.set || args.s) {
            let obj = dat || {
                id: user.id,
                points: 0,
                wins: 0,
                losses: 0
            };

            obj.points = args.points || obj.points;
            obj.wins = args.wins || obj.wins
            obj.losses = args.losses || obj.losses
            if (isNaN(obj.points + obj.wins + obj.losses)) return message.reply("invalid num").then(d(2000));
            if (dat) gdb.get(user.id).update(obj).run();
            else gdb.insert(obj).run();
            message.reply("Success").then(d(2000));
        }
        if (!dat) {
            message.channel.send(
                client.embed
                .setColor("RED")
                .setDescription("User has not played a game yet.")
            )
        }
        else {
            message.channel.send(
                client.embed
                .setColor("GREEN")
                .setDescription(`${user} has ${dat.points} points`)
                .addField("Wins", dat.wins, true)
                .addField("Losses", dat.losses, true)
            );
        }
    }

    if (message.content.startsWith("1v1 reload")) {
        if (message.author.id !== "142408079177285632") return message.reply("only the dev can run this command");
        switch (message.content.split(" ")[2]) {
            case "game":
                delete require.cache[require.resolve("./structs/game.js")];
                client.Game = require("./structs/game.js");
                break;
            case "queue":
                delete require.cache[require.resolve("./structs/queue.js")];
                client.channels.get("599374534017155112").messages.fetch("603621788533915658")
                    .then(x => {
                        console.log("fetch")
                        x.reactions.removeAll().then(oof => {
                            console.log("removed")
                            x.react("🎟").then(x => {
                                console.log("reacted")
                            })
                        })
                        client.queue = new Queue(client, x.guild, x, client.channels.get("599376824841142349"));
                    })
                break;
        }
        message.reply("reloaded").then(d(2000));
    }

    if (message.content === "1v1 cleanup") {
        if (!message.member.hasPermission("MANAGE_MESSAGES")) return message.reply("You don't have permission to run this command.").then(d(2000));
        if (!message.channel.parent || !message.channel.parent.name.match(/vs/gi)) return message.reply("Invalid channel").then(d(2000));
        message.channel.parent.children.forEach(chan => {
            chan.delete();
        });
        message.channel.parent.delete();
    }

    if (message.content.startsWith("1v1 queue")) {
        if (!message.member.hasPermission("MANAGE_MESSAGES")) return message.reply("You don't have permission to run this command.").then(d(2000));
        message.delete();
        if (message.guild.id !== "565906200059838468") return message.reply("unsupported guild").then(d(2000));
        if (args.clear || args.c) {
            client.queue.forEach(q => {
                client.queue.remove(q);
            })
            return client.channels.get("599374534017155112").messages.fetch("603621788533915658")
                .then(x => {
                    x.reactions.removeAll().then(oof => {
                        x.react("🎟");
                    })
                })
        }
        if (args.removeuser || args.r) {
            var user = parseMention(args.removeuser || args.r);
            client.channels.get("599374534017155112").messages.fetch("603621788533915658")
                .then(x => {
                    x.reactions.first().users.remove(user);
                })
            user = client.queue.get(user.id);
            if (!user) message.reply("user not in queue").then(d(2000));
            client.queue.remove(user);
        }
        if (args.adduser || args.a) {
            var user = parseMention(args.adduser || args.a);
            client.queue.set(user.id, { user: user });
        }
    }

    function clean(text) {
        if (typeof(text) === "string")
            return text.replace(/`/g, "`" + String.fromCharCode(8203)).replace(/@/g, "@" + String.fromCharCode(8203));
        else
            return text;
    }
    if (message.content.startsWith("1v1 eval")) {
        if (message.author.id !== "142408079177285632") return message.reply("only the dev can run this command");
        try {
            const code = message.content.split(" ").splice(2).join(" ").replace(/(‘|’)/g, "'").replace(/(“|”)/g, '"');
            let evaled = eval(code);

            if (evaled && evaled.then) evaled = await evaled;

            if (typeof evaled !== "string")
                evaled = require("util").inspect(evaled);

            if (evaled.length > 2000) {
                message.reply('Response too big!')
            }
            else {
                message.channel.send(clean(evaled), {
                    code: "xl"
                })
            }
        }
        catch (err) {
            message.channel.send(`\`ERROR\` \`\`\`xl\n${clean(err)}\n\`\`\``);
        }
    }
    if (message.content == "1v1 restart") {
        if (message.author.id !== "142408079177285632") return message.reply("only the dev can run this command");
        message.delete().then(x => {
            process.exit();
        })
    }
})

function createNewGame(user1, user2, guild) {
    var game = new client.Game(
        client,
        user1,
        user2,
        guild,
        db.table(guild.id),
        null,
        true
    )
    client.games.set(user1.id + user2.id, game);

    game.skipTo("createRoom");
}

client.on("guildMemberRemove", (member) => {
    let game = findGame(member.user, member.user);
    if (!game) return;
    var otherUser = game.sender.user.id == member.user.id ? 2 : 1;
    game.winner = otherUser;
    game.skipTo("handleWinner");
    game.clearRoom(true);
})

client.login(client.config.token);
