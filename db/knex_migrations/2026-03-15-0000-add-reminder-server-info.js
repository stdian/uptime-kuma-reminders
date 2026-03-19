exports.up = function (knex) {
    return knex.schema.alterTable("monitor", function (table) {
        table.string("reminder_server_ip", 255).defaultTo(null);
        table.date("reminder_expiry_date").defaultTo(null);
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable("monitor", function (table) {
        table.dropColumn("reminder_server_ip");
        table.dropColumn("reminder_expiry_date");
    });
};
