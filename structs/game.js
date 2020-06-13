const Discord = require("discord.js")
const moment = require("moment");
require("moment-duration-format");
var lvlMatch = /^\[[0-9]+\]/gi;

function m(time) {
    return moment.duration(time).format(' D [days], H [hours], m [minutes]')
}

const guilds = {
    "565906200059838468": {
        matches: "598609076943061003",
        cat: "598623494313476155",
        timeouts: {
            setup: 120000, //2 minutes
            gameTime: 600000, //10 minutes
            decideTime: 120000, //2 minutes
        }
    }
}

const ranks = [{
        rank: "iron",
        start: 0,
        end: 249,
        gain: 50,
        loss: 25,
        role: "599978734992359434"
    },
    {
        rank: "bronze",
        start: 250,
        end: 499,
        gain: 50,
        loss: 30,
        role: "599978824712585216"
    },
    {
        rank: "silver",
        start: 500,
        end: 749,
        gain: 50,
        loss: 35,
        role: "599978856837021730"
    },
    {
        rank: "gold",
        start: 75,
        end: 999,
        gain: 50,
        loss: 40,
        role: "599978867591086080"
    },
    {
        rank: "diamond",
        start: 1000,
        end: 1249,
        gain: 50,
        loss: 45,
        role: "599978871445782550"
    },
    {
        rank: "master",
        start: 1250,
        end: 1499,
        gain: 50,
        loss: 55,
        role: "599978884980670494"
    },
    {
        rank: "grandmaster",
        start: 1500,
        end: 1749,
        gain: 50,
        loss: 65,
        role: "599978887287406592"
    },
    {
        rank: "challenger",
        start: 1750,
        end: Infinity,
        gain: 50,
        loss: 75,
        role: "599978889149939722"
    },
]

for (var i = 0; i < ranks.length; i++) {
    ranks[i].index = i;
}

class Embeds {
    constructor(game, opts) {
        this.game = game;
        this.yes = opts.yes;
        this.no = opts.no;
        this.p1 = opts.p1;
        this.p2 = opts.p2;
        this.warn = opts.warn;
    }
    get embed() {
        return new Discord.MessageEmbed();
    }
    get confirmRequest() {
        return this.embed
            .setColor("GREEN")
            .setTitle("Confirm 1v1 Request")
            .setDescription(`${this.game.sender.user}: React ${this.yes} to confirm or ${this.no} to cancel`)
            .addField("From", this.game.sender.user, true)
            .addField("To", this.game.receiver.user, true)
            .setFooter("You have 1 minute to confirm");
    }
    get cancelMessage() {
        return this.embed
            .setColor("RED")
            .setDescription("Canceled!");
    }
    get timeout() {
        return this.embed
            .setColor("RED")
            .setDescription("Ran out of time!");
    }
    get receiverConfirm() {
        return this.embed
            .setColor("YELLOW")
            .setDescription(`${this.game.sender.user} challenged you to a 1v1`)
            .setFooter("Accept or Deny | You have 1 minute to respond");
    }
    get noDms() {
        return this.embed
            .setColor("RED")
            .setTitle("Error!")
            .setDescription("This user has DMs disabled!\n\nIn order to receive 1v1's you must enable DMs from the server.")
    }
    get receiverDeny() {
        return this.embed
            .setColor("RED")
            .setDescription(`${this.game.receiver.user} denied your request!`);
    }
    get waitingForConfirm() {
        return this.embed
            .setColor("YELLOW")
            .setDescription(`Waiting for ${this.game.receiver.user} to respond...`)
    }
    match(stage, time) {
        return this.embed
            .setColor("BLURPLE")
            .setTitle("Have fun!")
            .setDescription(
                `You have ${m(this.game.times.setup)} to add each other/setup the game\n` +
                `After that you have ${m(this.game.times.gameTime)} to fight.\n` +
                `Make sure you're not on DnD because the bot will ping you with important info, and actions\n` +
                `If you finish early, run \`1v1 end\`\n\n` +
                `Feel free to use the voice channels.`
            )
            .addField("Stage", stage, true)
            .addField("Time Remaining in Stage", m(time), true)
            .setTimestamp(new Date().getTime() - (new Date().getTimezoneOffset() * 60000));
    }
    get winnerDecide() {
        return this.embed
            .setColor("GREEN")
            .setTitle("Decide the winner")
            .setDescription("Choose the winner! Be truthful!! You have two minutes")
            .addField(this.p1, this.game.sender.user, true)
            .addField(this.p2, this.game.receiver.user, true)
            .setFooter(this.warn + " Warning! If you lie, there will be an investigation, and the liar will be banned!");
    }
}

class Game {
    constructor(client, sender, receiver, guild, db, message, queue) {
        this.queue = queue;
        this.client = client;
        if (message) this.invokeMessage = message;
        this.db = db;
        this.g = guild;
        this.matches = client.channels.get(guilds[guild.id].matches);
        this.cat = client.channels.get(guilds[guild.id].matches);
        this.times = guilds[guild.id].timeouts;
        this.embeds = new Embeds(this, {
            yes: client.emojis.get("598553289872900122"),
            no: client.emojis.get("598554771003015229"),
            p1: "🅰",
            p2: "🅱",
            warn: "⚠"
        })
        if (message) this.invokeChannel = message.channel;
        this.receiver = {
            member: guild.members.get(receiver.id),
            user: receiver
        };
        this.sender = {
            member: guild.members.get(sender.id),
            user: sender
        };
        db.get(this.sender.user.id).run()
            .then(senDat => {
                db.get(this.receiver.user.id).run()
                    .then(recDat => {
                        this.sender.dat = senDat || { id: this.sender.user.id, points: 0, wins: 0, losses: 0, no: true };
                        this.receiver.dat = recDat || { id: this.receiver.user.id, points: 0, wins: 0, losses: 0, no: true };

                        ranks.forEach(rank => {
                            if (this.sender.dat.points >= rank.start) this.sender.rank = rank;
                            if (this.receiver.dat.points >= rank.start) this.receiver.rank = rank;
                        })

                    })
            })

        if (message) this.start();
    }
    skipTo(fn) {
        clearTimeout(this.time);
        this[fn]();
    }
    start() {
        this.invokeChannel.send(this.embeds.confirmRequest).then(request => {
            this.request = request;
            this.handleYesNo(request, this.invokeMessage.author, () => this.handleConfirm(), () => this.handleDeny())
        })
    }
    handleConfirm() {
        this.receiver.user.send(this.embeds.receiverConfirm)
            .then(receiverConfirmMessage => {
                this.request.edit(
                    this.embeds.waitingForConfirm
                ).then(request => this.request = request);
                this.receiverConfirmMessage = receiverConfirmMessage;
                this.handleYesNo(receiverConfirmMessage, this.receiver.user, () => this.handleReceiverConfirm(), () => this.handleReceiverDeny(), () => this.receiverConfirmMessage.delete(), [this.request]);
            })
            .catch(err => {
                console.error(err);
                this.handleNoDms();
            })
    }
    handleNoDms() {
        this.request.edit(this.embeds.noDms).then(this.d(2000));
        this.destroyMatch()
    }
    handleDeny() {
        this.request.edit(
            this.embeds.cancelMessage
        ).then(this.d(3000));
        this.destroyMatch()
    }
    handleReceiverDeny() {
        this.request.edit(
            this.embeds.receiverDeny
        ).then(this.d(2000));
        this.destroyMatch()
    }
    handleReceiverConfirm() {
        console.log("c");
        this.request.delete();
        this.createRoom();
    }
    createRoom() {
        console.log("room");
        this.g.channels.create(
            `${this.sender.user.tag} vs ${this.receiver.user.tag}`, {
                type: "category",
                permissionOverwrites: [{
                        id: this.g.id,
                        deny: ["VIEW_CHANNEL", "SEND_MESSAGES", "CONNECT", "SPEAK"]
                    },
                    {
                        id: this.sender.user.id,
                        allow: ["VIEW_CHANNEL", "SEND_MESSAGES", "CONNECT", "SPEAK", "ATTACH_FILES"]
                    },
                    {
                        id: this.receiver.user.id,
                        allow: ["VIEW_CHANNEL", "SEND_MESSAGES", "CONNECT", "SPEAK", "ATTACH_FILES"]
                    }
                ]
            }
        ).then(category => {
            this.matchCategory = category;
            this.createChildren();
        })
    }
    createChildren() {
        this.g.channels.create(
            "text", {
                type: "text",
                parent: this.matchCategory
            }
        ).then(textchannel => {
            this.matchText = textchannel;
            this.g.channels.create(
                "voice", {
                    type: "voice",
                    parent: this.matchCategory
                }
            ).then(voicechannel => {
                this.matchVoice = voicechannel;
                this.startMatch();
            })
        })
    }

    startMatch() {
        this.matchText.send(
            `${this.sender.user} challenged ${this.receiver.user} to a 1v1`, {
                embed: this.embeds.match("Setup", this.times.setup)
            }
        ).then(matchBox => {
            this.matchBox = matchBox;
            this.time = setTimeout(() => {
                this.gameTime();
                this.matchText.send(`${this.sender.user} & ${this.receiver.user} FIGHT!`)
            }, this.times.setup);
        });
    }
    gameTime(time = 0) {
        this.matchBox.edit(
            `${this.sender.user} challenged ${this.receiver.user} to a 1v1`, {
                embed: this.embeds.match("Fighting", this.times.gameTime - time)
            }
        ).then(matchBox => {
            this.matchBox = matchBox;
            if (this.times.gameTime - time > 300000) {
                this.time = setTimeout(() => {
                    this.gameTime(time + 300000);
                }, 300000)
            }
            else {
                this.time = setTimeout(() => {
                    this.Minute3();
                }, 120000)
            }
        })
    }
    Minute3() {
        this.matchBox.edit(
            `${this.sender.user} challenged ${this.receiver.user} to a 1v1`, {
                embed: this.embeds.match("Fighting", 180000)
            }
        ).then(matchBox => {
            this.matchBox = matchBox;
            this.time = setTimeout(() => {
                this.Minute2();
            }, 60000)
        })
    }
    Minute2() {
        this.matchBox.edit(
            `${this.sender.user} challenged ${this.receiver.user} to a 1v1`, {
                embed: this.embeds.match("Fighting", 120000)
            }
        ).then(matchBox => {
            this.matchBox = matchBox;
            this.time = setTimeout(() => {
                this.Minute1();
            }, 60000)
        })
    }
    Minute1() {
        this.matchBox.edit(
            `${this.sender.user} challenged ${this.receiver.user} to a 1v1`, {
                embed: this.embeds.match("Fighting", 60000)
            }
        ).then(matchBox => {
            this.matchBox = matchBox;
            this.matchText.send(`${this.sender.user} & ${this.receiver.user} 1 minute remaining!`)
            this.time = setTimeout(() => {
                this.endMatch();
            }, 60000)
        })
    }

    endMatch() {
        this.matchBox.edit(
            `${this.sender.user} challenged ${this.receiver.user} to a 1v1`, {
                embed: this.embeds.match("Deciding", this.times.decideTime)
            }
        ).then(matchBox => {
            this.matchBox = matchBox;
            this.matchText.send(
                `${this.sender.user} & ${this.receiver.user} Decide ;`, {
                    embed: this.embeds.winnerDecide
                }
            ).then(decideBox => {
                this.decideBox = decideBox;
                this.handleDecide();
            })
        })
    }

    handleDecide() {
        this.decideBox.react(this.embeds.p1).then(x => {
            this.decideBox.react(this.embeds.p2).then(x => {
                this.decideBox.awaitReactions(
                        this.createFilter(
                            [
                                this.embeds.p1,
                                this.embeds.p2,
                            ], [
                                this.sender.user.id,
                                this.receiver.user.id
                            ]
                        ), {
                            max: 2,
                            time: 120000
                        }
                    )
                    .then(collected => {
                        if (collected.keyArray().length > 1) {
                            var parent = this.matchText.parent;

                            this.matchText.send("The two of you, have challenged each other. Please present proof of one or another winning. And an admin will get to you as soon as possible. If this was a mistake, just say so. If not, you will be banned!")
                            this.matchText.setParent(this.cat).then(x => {
                                this.clearRoom(false);
                            })
                        }
                        else {
                            if (!collected.first()) return this.clearRoom(true);
                            this.winner = collected.first().emoji.name == this.embeds.p1 ? 1 : 2;
                            if (this.winner) this.handleWinner();
                            this.clearRoom(true);
                        }
                    })
            })
        })
    }

    handleWinner() {
        let te;
        if (this.winner == 1) {
            this.sender.dat.points += this.sender.rank.gain;
            this.sender.dat.wins += 1;

            this.receiver.dat.points -= this.receiver.rank.loss;
            this.receiver.dat.losses += 1;

            te = "won";
        }
        else {
            this.receiver.dat.points += this.receiver.rank.gain;
            this.receiver.dat.wins += 1;

            this.sender.dat.points -= this.sender.rank.loss;
            this.sender.dat.losses += 1;
            
            te = "lost";
        };

        if(this.sender.dat.points < 1) this.sender.dat.points = 1;
        if(this.receiver.dat.points < 1) this.receiver.dat.points = 1;
        
        ranks.forEach(rank => {
            if (this.sender.dat.points >= rank.start && this.sender.dat.points <= rank.end && !this.sender.member.roles.has(rank.role)) {
                this.sender.member.roles.remove(ranks.map(x=>x.role))
                    .then(x=>{
                        this.sender.member.roles.add(rank.role);
                    })
            }
            if (this.receiver.dat.points >= rank.start && this.receiver.dat.points <= rank.end && !this.receiver.member.roles.has(rank.role)) {
                this.receiver.member.roles.remove(ranks.map(x=>x.role))
                    .then(x=>{
                        this.receiver.member.roles.add(rank.role);
                    })
            }
        })

        if (!this.queue) this.matches.send(`${this.sender.user} challenged ${this.receiver.user} and ${te}!`);
        else this.matches.send(`${this.sender.user} and ${this.receiver.user} queue'd and ${this.winner == 1 ? `${this.sender.user}` : `${this.receiver.user}`} won!`);

        if (!this.sender.dat.no) this.db.get(this.sender.user.id).update(this.sender.dat).run();
        else {
            this.sender.dat.no = undefined;
            this.db.insert(this.sender.dat).run();
        }
        if (!this.receiver.dat.no) this.db.get(this.receiver.user.id).update(this.receiver.dat).run();
        else {
            this.receiver.dat.no = undefined;
            this.db.insert(this.receiver.dat).run();
        }
    }

    clearRoom(clearText) {
        if (clearText) this.matchText.delete();
        this.matchVoice.delete();
        this.matchCategory.delete();
        this.destroyMatch()
    }

    handleYesNo(message, user, yes, no, both, extraMsgs) {
        message.react(this.embeds.yes).then(x => {
            message.react(this.embeds.no).then(x => {
                message.awaitReactions(
                        this.createFilter(
                            [
                                this.embeds.yes.id,
                                this.embeds.no.id,
                            ], [
                                user.id
                            ]
                        ), {
                            max: 1,
                            time: 60000
                        }
                    )
                    .then(collected => {
                        if (!collected.first()) return this.handleTimeout(message, extraMsgs);
                        if (message.guild) message.reactions.removeAll();
                        else message.reactions.forEach(re => { re.users.remove() });
                        if (collected.first().emoji.id === this.embeds.yes.id) yes()
                        else no();
                        if (both) both();
                    })
                    .catch(this.handleError)
            })
        })
    }
    handleTimeout(msg, extraMsgs = []) {
        msg.edit(
            this.embeds.timeout
        ).then(this.d(2000));
        extraMsgs.forEach((z) => {
            z.edit(
                this.embeds.timeout
            ).then(this.d(2000))
        })
        this.destroyMatch();
    }
    createFilter(emojis, users) {
        return (reaction, user) => (emojis.includes(reaction.emoji.id) || emojis.includes(reaction.emoji.name)) && users.includes(user.id);
    }
    handleError(err) {
        console.error(err);
    }
    d(time) {
        return (msg) => {
            setTimeout(() => {
                msg.delete()
            }, time);
        }
    }
    destroyMatch() {
        this.client.games.delete(this.sender.user.id + this.receiver.user.id)
    }
}

module.exports = Game;
