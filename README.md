# front_mediamtx

Простой статический веб‑интерфейс для **MediaMTX**:

- показывает список путей (`/v3/paths/list`);
- показывает список записей за последние 24 часа через **Playback API** (`/list`);
- воспроизводит записи в **Video.js**;
- перемотка и подгрузка выполняются через **MSE** (Media Source Extensions) и `format=fmp4` (чанки докидываются в один `<video>`, без перезагрузки `src`).

## Требования

- Запущенный MediaMTX с включённым **Web API** (по умолчанию в UI: `http://localhost:9997`).
- Включённый **Playback API** (по умолчанию в UI: `http://localhost:9996`).
- Для “бесшовной” перемотки нужен `format=fmp4` в `/get` (обычный `format=mp4` не содержит `moof` и для MSE не подходит).
- CORS: страница должна иметь доступ к `9997/9996` (обычно проще открывать UI через локальный http‑сервер, а не `file://`).

## Запуск

1) Подними простой статический сервер в папке проекта:

```bash
python3 -m http.server 8080
```

2) Открой в браузере:

```text
http://localhost:8080
```

3) В интерфейсе проверь/укажи:

- `API URL` → `http://localhost:9997`
- `Playback URL` → `http://localhost:9996`

Нажми **“Загрузить пути”** → кликни по имени пути → выбери сегмент записи.

## Как работает воспроизведение (кратко)

MediaMTX отдаёт запись по `GET /get?path=...&start=...&duration=...&format=fmp4`.

UI:

- создаёт `MediaSource` и `SourceBuffer` с правильным MIME (`video/mp4; codecs="..."`);
- первый запрос берёт init‑сегмент + медиа‑фрагменты, init добавляется один раз;
- далее UI докачивает новые чанки вперёд по мере приближения к концу буфера;
- при перемотке UI **не очищает** буфер, а докидывает нужный чанк и прыгает в позицию.

На таймлайне Video.js обычно видно:

- тёмно‑серое — реально буферизовано (`buffered`);
- светло‑серое — “можно перематывать” (`seekable`). В UI `seekable` расширен на всю длительность записи, чтобы клик по таймлайну работал даже вне текущего буфера.

## Проверка, что `fmp4` действительно fMP4

Скрипт сам берёт последнюю запись `cam3` за 24 часа и печатает боксы MP4 (ищет `moof`):

```bash
node scripts/probe-fmp4-cam3.mjs
```

Параметры:

```bash
node scripts/probe-fmp4-cam3.mjs --path cam3 --playback http://localhost:9996 --bytes 1048576
```

Если для `format=fmp4` в начале есть `moof` — можно использовать MSE.

## Траблшутинг

### “Media could not be loaded…”

Чаще всего:

- нет доступа к `http://localhost:9996` (CORS / mixed content / неверный URL);
- запросы идут с `format=mp4` вместо `format=fmp4`;
- браузер не поддерживает MSE/кодек (см. `MSE type not supported` в консоли).

### `Unexpected token 'export'` в `mp4box`

Нужно подключать UMD‑сборку mp4box, а не ESM. В этом проекте используется `mp4box@0.5.2`.

### Логи

Открой DevTools → Console/Network:

- `MSE codec mime: ...` — какой MIME собрался для `SourceBuffer`;
- `MSE init error / MSE seek error / MSE pump error` — ошибки и стектрейсы.

## Лицензия

MIT (если нужно — добавь `LICENSE`).

