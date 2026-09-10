# Banalili Resto — Online Ordering

A single-page ordering flow: **Menu → Cart → Checkout → Confirm → Dine-in/Take-out → Order code → Thank you**.

## Files

```
banalili-resto/
├── index.html          the whole ordering flow (all "screens" live here as toggled sections)
├── css/style.css        styling
├── js/app.js             all client-side logic: cart state, view switching, API calls
├── php/api.php           backend: serves the menu, validates + prices orders server-side,
│                          generates the order code, and stores orders
├── data/menu.json        menu data (categories + items + prices)
└── data/orders.json      created/updated automatically — every placed order is appended here
```

## Why PHP + JSON

`js/app.js` never trusts the browser for prices — it sends only item IDs and quantities to
`php/api.php`, which looks up real prices from `menu.json`, computes the total itself, generates
a unique order code (pattern like `N14L8`), and appends the full order to `orders.json`. That's
the "real backend" piece: JavaScript on the front end, PHP + JSON on the back end.

If `php/api.php` can't be reached (for example if you just double-click `index.html` with no PHP
server running), the app quietly falls back to generating the code in the browser instead, so the
flow still works end-to-end for a quick demo — but for the real submission, run it with PHP so
orders actually get validated and saved server-side.

## Running it locally

You need PHP installed (comes with **XAMPP**, or install PHP directly).

**Option A — PHP's built-in server**
```bash
cd banalili-resto
php -S localhost:8000
```
Then open `http://localhost:8000` in your browser.

**Option B — XAMPP**
Copy the `banalili-resto` folder into `htdocs`, start Apache, then visit
`http://localhost/banalili-resto/`.

## Deploying it (for your Lab submission)

You need a host that runs PHP — plain static hosts (Netlify, GitHub Pages, Vercel static) will
**not** execute `php/api.php`. Free options that do:
- InfinityFree, 000webhost, or any shared PHP hosting
- Your school's server, if one is provided
- A small VPS with PHP installed

Upload the whole `banalili-resto` folder (keeping the same structure) to the host's web root, then
make sure the `data/` folder is writable by the web server (e.g. `chmod 775 data`) so
`orders.json` can be updated.

## Checking a placed order

`php/api.php?action=order_status&code=N14L8` returns the stored order for that code — useful for
a kitchen/counter view if you want to extend this later.
