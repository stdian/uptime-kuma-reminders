exports.up = function (knex) {
    return knex.schema.alterTable("monitor", function (table) {
        table.integer("reminder_renewal_days").defaultTo(0);
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable("monitor", function (table) {
        table.dropColumn("reminder_renewal_days");
    });
};
