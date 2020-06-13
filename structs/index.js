const Game = require("./game.js")
module.exports = {
    game: Game,
    createNewGame: (user1, user2, guild) => {
        var game = new Game(
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
}
