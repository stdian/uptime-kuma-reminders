const { MonitorType } = require("./monitor-type");
const { UP, DOWN } = require("../../src/util");
const Cron = require("croner");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("../modules/dayjs/plugin/timezone");
const { R } = require("redbean-node");
const { SQL_DATETIME_FORMAT } = require("../../src/util");

dayjs.extend(utc);
dayjs.extend(timezone);

class ReminderMonitorType extends MonitorType {
    name = "Reminder";
    type = "reminder";
    description = "Напоминание по расписанию (cron). Отправляет уведомление в заданное время.";
    supportsConditions = false;
    conditionVariables = [];

    allowCustomStatus = true;

    /**
     * @inheritdoc
     */
    async check(monitor, heartbeat, server) {
        const cronExpr = monitor.reminder_cron?.trim();
        if (!cronExpr) {
            heartbeat.status = UP;
            heartbeat.msg = "Расписание не задано";
            return;
        }

        const tz = monitor.reminder_timezone || "UTC";
        let job;
        try {
            job = new Cron(cronExpr, { timezone: tz }, () => {});
        } catch (e) {
            heartbeat.status = DOWN;
            heartbeat.msg = `Неверный cron: ${e.message}`;
            return;
        }

        const now = new Date();

        // Окно поиска текущего слота: интервал * 2 (минимум 2 минуты).
        // Гарантирует отсутствие cascade при restart: пропущенные слоты старше окна игнорируются.
        const lookbackMs = Math.max((monitor.interval || 60) * 2 * 1000, 2 * 60 * 1000);
        const windowStart = new Date(now.getTime() - lookbackMs);

        const currentSlot = job.nextRun(windowStart); // первый слот начиная с windowStart
        const nextFutureSlot = job.nextRun(now);       // следующий слот в будущем (для отображения)
        job.stop();

        const isInTriggerWindow = currentSlot !== null && currentSlot <= now;

        if (isInTriggerWindow) {
            const currentSlotStr = dayjs(currentSlot).utc().format(SQL_DATETIME_FORMAT);
            const lastTriggeredStr = monitor.reminder_last_triggered
                ? dayjs.utc(monitor.reminder_last_triggered).format(SQL_DATETIME_FORMAT)
                : null;
            const alreadyTriggered = lastTriggeredStr === currentSlotStr;

            if (!alreadyTriggered) {
                heartbeat.status = DOWN;
                const serverLabel = monitor.reminder_server_ip
                    ? ` ${monitor.reminder_server_ip}`
                    : "";
                heartbeat.msg = `Продлите сервер${serverLabel}`;
                heartbeat.important = true;

                monitor.reminder_last_triggered = currentSlotStr;
                await R.exec(
                    "UPDATE monitor SET reminder_last_triggered = ? WHERE id = ?",
                    [currentSlotStr, monitor.id]
                );

                // Авто-продление даты истечения, если она наступила и задан период
                await this._checkAndRenewExpiry(monitor);
                return;
            }
        }

        heartbeat.status = UP;

        // Предупреждение о скором истечении
        const expiryMsg = this._expiryWarning(monitor);
        if (expiryMsg) {
            heartbeat.msg = expiryMsg;
            return;
        }

        if (nextFutureSlot) {
            heartbeat.msg = `Следующее напоминание: ${dayjs(nextFutureSlot).tz(tz).format("DD.MM.YYYY HH:mm")}`;
        } else {
            heartbeat.msg = "Следующий запуск не запланирован";
        }
    }

    /**
     * Если дата истечения наступила и задан период продления — сдвигаем дату вперёд.
     * @param {object} monitor
     */
    async _checkAndRenewExpiry(monitor) {
        const expiryDate = monitor.reminder_expiry_date;
        const renewalDays = parseInt(monitor.reminder_renewal_days) || 0;
        if (!expiryDate || renewalDays <= 0) {
            return;
        }

        const today = dayjs().startOf("day");
        const expiry = dayjs(expiryDate).startOf("day");
        if (today.isBefore(expiry)) {
            return;
        }

        // Сдвигаем дату вперёд кратно renewalDays, чтобы оказаться в будущем
        let newExpiry = expiry;
        while (!newExpiry.isAfter(today)) {
            newExpiry = newExpiry.add(renewalDays, "day");
        }
        const newExpiryStr = newExpiry.format("YYYY-MM-DD");
        monitor.reminder_expiry_date = newExpiryStr;
        await R.exec(
            "UPDATE monitor SET reminder_expiry_date = ? WHERE id = ?",
            [newExpiryStr, monitor.id]
        );
    }

    /**
     * Возвращает сообщение-предупреждение если до даты истечения ≤ 7 дней, иначе null.
     * @param {object} monitor
     * @returns {string|null}
     */
    _expiryWarning(monitor) {
        const expiryDate = monitor.reminder_expiry_date;
        if (!expiryDate) {
            return null;
        }
        const today = dayjs().startOf("day");
        const expiry = dayjs(expiryDate).startOf("day");
        const diff = expiry.diff(today, "day");

        if (diff === 0) {
            return `⚠️ Сегодня истекает: ${expiryDate}`;
        } else if (diff > 0 && diff <= 7) {
            return `⚠️ Истекает через ${diff} дн. (${expiryDate})`;
        } else if (diff < 0) {
            return `❌ Просрочено на ${Math.abs(diff)} дн. (${expiryDate})`;
        }
        return null;
    }
}

module.exports = {
    ReminderMonitorType,
};
