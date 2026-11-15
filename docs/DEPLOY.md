# Развёртывание в Cloudflare

1. Создать отдельную D1 database с именем `sistema-rosta-db`.
2. Скопировать её ID в `wrangler.toml` вместо `REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID`.
3. Выполнить `npm install`, затем `npm run db:migrate:remote`.
4. В Cloudflare Pages создать проект из этого GitHub-репозитория.
5. Build command оставить пустой; output directory — `public`.
6. В Settings → Functions → D1 database bindings добавить binding `DB` к созданной базе.
7. Проверить регистрацию, вход, выход и изоляцию данных разных пользователей.

До публичного запуска добавить rate limiting для регистрации/входа, подтверждение email, сброс пароля, CSRF-проверку для изменяющих запросов, политику конфиденциальности и юридические документы. Не использовать реальную базу с тестовыми или публичными демонстрационными аккаунтами.
