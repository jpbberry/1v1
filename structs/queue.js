const Discord = require("discord.js");
const timeout = 900000;

function d(time) {
    return function(msg) {
        if(msg)
            setTimeout(() => {
                msg.delete()
            }, time);
    }
}

function createNewGame(client, user1, user2, guild) {
    var game = new client.Game(
        client,
        user1,
        user2,
        guild,
        client.db.table(guild.id),
        null,
        true
    )
    client.games.set(user1.id + user2.id, game);

    game.skipTo("createRoom");
}

class Embeds {
    constructor(queue, opts) {
        this.queue = queue;
        this.yes = opts.yes;
        this.no = opts.no;
    }
    get embed() {
        return new Discord.MessageEmbed();
    }
    queueUpdate(addorremove, user) {
        let ar = addorremove == 1;
        return this.embed
            .setColor(ar ? "GREEN" : "RED")
            .setDescription(`${user} ${ar ? "joined" : "left"} the queue`)
            .setTimestamp(new Date());
    }

    get checkup() {
        return this.embed
            .setTitle("AFK Check")
            .setDescription(`Please react ${this.yes} to confirm you're not afk, in order to stay in the queue`)
            .setFooter("1 minute | Or add an X to leave the queue")
            .setColor("ORANGE");
    }

    get afk() {
        return this.embed
            .setColor("RED")
            .setTitle("Kicked from queue")
            .setDescription("For being afk");
    }

    get notafk() {
        return this.embed
            .setColor("GREEN")
            .setTitle("Confirmed not afk!");
    }
}

class QueueUser {
    constructor(queue, user) {
        this.queue = queue;
        this.client = queue.client;
        this.user = user;
        this.timeout = null;

        this.setup();
    }
    setup() {
        this.timeout = setTimeout(() => {
            this.checkup();
        }, timeout)
    }
    checkup() {
        this.user.send(
            this.queue.embeds.checkup
        ).then(msg => {
            this.afkcheck = msg;
            this.handleYesNo(msg, this.user, () => {
                this.handleYes()
            }, () => {
                this.handleNo()
            }, null)
        })
    }
    handleNo() {
        this.afkcheck.edit(
            this.queue.embeds.afk
        );
        this.queue.remove(this);
        this.queue.queueUpdate(0, this.user);
    }
    handleYes() {
        this.afkcheck.edit(
            this.queue.embeds.notafk
        ).then(d(3000));
        this.setup();
    }
    handleYesNo(message, user, yes, no, both) {
        message.react(this.queue.embeds.yes).then(x => {
            message.react(this.queue.embeds.no).then(x => {
                message.awaitReactions(
                        this.createFilter(
                            [
                                this.queue.embeds.yes.id,
                                this.queue.embeds.no.id,
                            ],
                            [
                                user.id
                            ]
                        ), {
                            max: 1,
                            time: 60000
                        }
                    )
                    .then(collected => {
                        if (!collected.first()) return no();
                        if (collected.first().emoji.id === this.queue.embeds.yes.id) yes()
                        else no();
                        if (both) both();
                    })
                    .catch(this.handleError)
            })
        })
    }
    createFilter(emojis, users) {
        return (reaction, user) => (emojis.includes(reaction.emoji.id) || emojis.includes(reaction.emoji.name)) && users.includes(user.id);
    }

    destroy() {
        clearTimeout(this.timeout);
        this.queue.delete(this.user.id);
    }
}

class Queue extends Discord.Collection {
    constructor(client, guild, message, logchannel) {
        super();
        this.client = client;
        this.guild = guild;
        this.message = message;
        this.channel = logchannel;

        this.ratelimit = [];

        const events = {
            MESSAGE_REACTION_ADD: 'messageReactionAdd',
            MESSAGE_REACTION_REMOVE: 'messageReactionRemove',
        };

        this.embeds = new Embeds(this, {
            yes: client.emojis.get("598553289872900122"),
            no: client.emojis.get("598554771003015229")
        })

        client.on('raw', async event => {
            // `event.t` is the raw event name
            if (!events.hasOwnProperty(event.t)) return;

            const {
                d: data
            } = event;
            const user = client.users.get(data.user_id);
            const channel = client.channels.get(data.channel_id) || await user.createDM();

            // if the message is already in the cache, don't re-emit the event
            if (channel.messages.has(data.message_id)) return;

            // if you're on the master/v12 branch, use `channel.messages.fetch()`
            const message = await channel.messages.fetch(data.message_id);

            // custom emojis reactions are keyed in a `name:ID` format, while unicode emojis are keyed by names
            // if you're on the master/v12 branch, custom emojis reactions are keyed by their ID
            const reaction = message.reactions.get(data.emoji.id || data.emoji.name);

            client.emit(events[event.t], reaction, user);
        });

        client.on("messageReactionAdd", (r, u) => this.reactionAdd(r, u));
        client.on("messageReactionRemove", (r, u) => this.reactionDelete(r, u));
    }
    add(user) {
        this.set(user.id,
            new QueueUser(this, user)
        )
    }

    remove(users) {
        if(!(users instanceof Array)) users = [users];
        users.forEach(user => {
            if(user instanceof QueueUser) user = user.user;
            var User = this.get(user.id)
            if(!User) return;
            User.destroy();
            this.delete(user.id);
            this.reaction.users.remove(user.id);
        })
    }
    
    get reaction() {
        return this.message.reactions.get("🎟");
    }

    reactionAdd(reaction, user) {
        if (reaction.message.id !== this.message.id ||
            user.bot ||
            this.has(user.id)) return;

        if (this.ratelimit.includes(user.id)) return reaction.users.remove(user);
        this.ratelimit.push(user.id);
        setTimeout(() => {
            this.ratelimit.pop(this.ratelimit.indexOf(user.id));
        }, 15000)

        this.queueUpdate(1, user);

        this.add(user);

        this.handleQueueCheck();
    }

    reactionDelete(reaction, user) {
        if (reaction.message.id !== this.message.id ||
            user.bot ||
            !this.has(user.id)
        ) return;

        this.queueUpdate(0, user);

        this.remove(user);
    }

    queueUpdate(addorremove, user) {
        this.channel.send(
            this.embeds.queueUpdate(
                addorremove,
                user
            )
        )
    }

    handleQueueCheck() {
        if(this.size < 2) return;
        let user1 = this.first();
        let user2 = this.first(2)[1];

        this.remove([user1, user2]);
        this.queueUpdate(0, `${user1.user} & ${user2.user}`);
        
        createNewGame(
            this.client,
            user1.user,
            user2.user,
            this.guild
        )
    }
}

module.exports = {
    Queue: Queue,
    QueueUser: QueueUser
};