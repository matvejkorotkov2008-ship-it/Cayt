// Конфигурация для Telegram API
// Для получения токена бота:
// 1. Найдите @BotFather в Telegram
// 2. Отправьте команду /newbot
// 3. Следуйте инструкциям
// 4. Скопируйте полученный токен сюда

// ВАЖНО: Этот файл опционален. Сайт будет работать и без него,
// используя публичные API для получения данных из канала.

if (typeof CONFIG === 'undefined') {
    var CONFIG = {
        // Telegram Bot Token (получите у @BotFather)
        // ВАЖНО: Для публичных каналов бот должен быть администратором канала
        BOT_TOKEN: 'YOUR_BOT_TOKEN_HERE',
        
        // Username канала (без @)
        CHANNEL_USERNAME: 'BMJAN',
        
        // Количество постов для загрузки
        POSTS_LIMIT: 20,
        
        // Интервал обновления (в миллисекундах) - 5 минут
        UPDATE_INTERVAL: 5 * 60 * 1000,
        
        // Использовать прокси для обхода CORS (опционально)
        USE_PROXY: false,
        PROXY_URL: 'https://api.allorigins.win/raw?url='
    };
}

// Альтернативный метод: использование публичного RSS фида Telegram
// Если у вас есть RSS фид, раскомментируйте следующую строку:
// const RSS_FEED_URL = 'https://rss.app/feeds/YOUR_FEED_ID.xml';

