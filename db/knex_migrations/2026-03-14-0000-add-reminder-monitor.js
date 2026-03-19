exports.up = function (knex) {
    return knex.schema.alterTable("monitor", function (table) {
        table.string("reminder_cron", 100).defaultTo(null);
        table.string("reminder_timezone", 64).defaultTo(null);
        table.datetime("reminder_last_triggered").defaultTo(null);
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable("monitor", function (table) {
        table.dropColumn("reminder_cron");
        table.dropColumn("reminder_timezone");
        table.dropColumn("reminder_last_triggered");
    });
};
