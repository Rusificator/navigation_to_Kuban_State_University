# Источники и пределы выводов

Проверка источников: 17-18 октября 2026 года. Наличие страницы в сети не равно подтверждению актуальности её содержимого.

| Источник | Адрес | Использование / ограничение |
|---|---|---|
| Предоставленный APK | SHA-256 в ANALYSIS.md | Первичный источник геометрии, графа, исходных имён и описаний; дата проверки на местности отсутствует |
| Google Play, точный ID | https://play.google.com/store/apps/details?id=ru.initlab.pathfinderkubsu&hl=ru&gl=RU | Карточка недоступна веб-инструменту; HTTP-проверка вернула 404; последняя версия не установлена |
| APKPure | https://apkpure.net/ru/кубгу-навигатор/ru.initlab.pathfinderkubsu | Вторичный архив 1.0.3; не заменяет Google Play и проверку подписи |
| Виртуальный тур КубГУ, карта | https://vtour.kubsu.ru/map/map.html?area=01 | Официальные адреса и структура площадок; на странице старое указание © 2009-2015 |
| Тур главного кампуса | https://vtour.kubsu.ru/01/index.html | Панорамы и вспомогательная ориентация |
| Данные тура | https://vtour.kubsu.ru/map/mapEngine/db.js | Ссылки на планы и варианты обозначений блоков; не использованы как подтверждение новых дверей |
| План главного корпуса, этаж 1 | https://vtour.kubsu.ru/map/maps/krasnodar/head/general/building_general_floor_1.jpg | Визуально изучен; нет автоматической регистрации с SVG и нет вывода об актуальности всех кабинетов |
| Навигатор юридического факультета | https://law.kubsu.ru/Навигатор-по-аудиторному-фонду-юриди/ | Дополнительные адреса: Рашпилевская, 43; Октябрьская, 25; Постовая, 39. Они не включены в граф главного кампуса |
| OpenStreetMap relation 4512079 | https://www.openstreetmap.org/relation/4512079 | Граница наружного слоя и географическая модель |
| OSM API XML | https://api.openstreetmap.org/api/0.6/map?bbox=39.025,45.016,39.037,45.024 | Получен XML с координатами; отобраны 84 объекта и 3 POI в границе кампуса |
| OSM attribution | https://www.openstreetmap.org/copyright | Условия атрибуции ODbL для наружной базы |
| Capacitor environment | https://capacitorjs.com/docs/getting-started/environment-setup | Требования к инструментам Android/iOS, Node, Xcode |
| Capacitor Geolocation | https://capacitorjs.com/docs/apis/geolocation | Запрос разрешений, watchPosition, clearWatch, платформенные ключи |
| Capacitor Preferences | https://capacitorjs.com/docs/apis/preferences | Локальное хранение и iOS UserDefaults reason CA92.1 |
| Three.js documentation | https://threejs.org/docs/ | Сцена, геометрия, камера, освобождение ресурсов |

Координаты центра из поисковой карты не использованы как геопривязка внутренних планов. Официальные географические источники и пользовательский APK не смешиваются в общий набор «проверенных фактов»: происхождение и степень подтверждения сохраняются.

## Источники дополнений 19.10.2026

- Уточнения команды кампуса · 19.10.2026 — материал пользователя в этой беседе.
- Фотография указателя территории КубГУ — материал пользователя в этой беседе.
- Приложенные снимки Яндекс Карт — материал пользователя в этой беседе.
- Виртуальный тур КубГУ: https://vtour.kubsu.ru/map/map.html
- Телефонный справочник КубГУ: https://tel.kubsu.ru/
- Яндекс Карты · Ставропольская, 149: https://yandex.com/maps/35/krasnodar/house/stavropolskaya_ulitsa_149/Z0AYdgRhS0UBQFpvfXxweHphYw==/inside/
- Яндекс Карты · Буфет № 10: https://yandex.com/maps/org/bufet_10/206743041271/
- Яндекс Карты · Профком студентов: https://yandex.com/maps/org/pervichnoye_profsoyuznaya_organizatsiya_studentov_kubgu/1134024905/
- Яндекс Карты · Технопарк: https://yandex.com/maps/org/kuban_state_university_science_and_technology_park_technopark_university/1168261110/
- Яндекс Карты · Бассейн КубГУ: https://yandex.com/maps/org/basseyn_kubgu/182282623432/
- Яндекс Карты · Научная библиотека: https://yandex.com/maps/org/nauchnaya_biblioteka_kubgu/1219773688/
- OpenStreetMap · территория КубГУ: https://www.openstreetmap.org/relation/4512079
- Приложенный репозиторий · разметка стадиона — материал пользователя в этой беседе.

Подробный разбор соответствий и ограничений: [REVISION-0.2.md](REVISION-0.2.md).
