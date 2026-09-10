<?php
/**
 * Banalili Resto — backend API
 * Actions (via ?action=):
 *   menu         GET  -> returns the full menu as JSON
 *   place_order  POST -> accepts { customer, items, orderType }, stores the order,
 *                         and returns a generated order code
 *   order_status GET  -> ?code=XXXXX returns a stored order (optional, for lookups)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

define('MENU_FILE', __DIR__ . '/../data/menu.json');
define('ORDERS_FILE', __DIR__ . '/../data/orders.json');

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'menu':
        handle_get_menu();
        break;

    case 'place_order':
        handle_place_order();
        break;

    case 'order_status':
        handle_order_status();
        break;

    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Unknown or missing action.']);
        break;
}

/* ------------------------------------------------------------------ */

function handle_get_menu() {
    if (!file_exists(MENU_FILE)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Menu data not found.']);
        return;
    }
    $menu = json_decode(file_get_contents(MENU_FILE), true);
    echo json_encode(['success' => true, 'menu' => $menu]);
}

function handle_place_order() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'POST required.']);
        return;
    }

    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);

    if (!$payload || empty($payload['items']) || !is_array($payload['items'])) {
        http_response_code(422);
        echo json_encode(['success' => false, 'error' => 'Order must include at least one item.']);
        return;
    }

    $orderType = $payload['orderType'] ?? null;
    if (!in_array($orderType, ['dine-in', 'takeout'], true)) {
        http_response_code(422);
        echo json_encode(['success' => false, 'error' => 'orderType must be "dine-in" or "takeout".']);
        return;
    }

    // Recompute totals server-side against the real menu, never trust client prices.
    $menu = json_decode(file_get_contents(MENU_FILE), true);
    $priceLookup = [];
    foreach ($menu['categories'] as $cat) {
        foreach ($cat['items'] as $item) {
            $priceLookup[$item['id']] = $item;
        }
    }

    $lineItems = [];
    $total = 0;
    foreach ($payload['items'] as $line) {
        $id  = $line['id'] ?? null;
        $qty = max(1, (int)($line['qty'] ?? 1));
        if (!$id || !isset($priceLookup[$id])) {
            continue; // skip unknown items rather than failing the whole order
        }
        $item = $priceLookup[$id];
        $lineTotal = $item['price'] * $qty;
        $total += $lineTotal;
        $lineItems[] = [
            'id' => $id,
            'name' => $item['name'],
            'price' => $item['price'],
            'qty' => $qty,
            'lineTotal' => $lineTotal
        ];
    }

    if (empty($lineItems)) {
        http_response_code(422);
        echo json_encode(['success' => false, 'error' => 'No valid items in order.']);
        return;
    }

    $orders = load_orders();
    $code = generate_unique_code($orders);

    $order = [
        'code' => $code,
        'customer' => [
            'name' => trim($payload['customer']['name'] ?? ''),
            'contact' => trim($payload['customer']['contact'] ?? ''),
            'notes' => trim($payload['customer']['notes'] ?? '')
        ],
        'items' => $lineItems,
        'total' => $total,
        'orderType' => $orderType,
        'status' => 'confirmed',
        'placedAt' => date('c')
    ];

    $orders[] = $order;
    save_orders($orders);

    echo json_encode([
        'success' => true,
        'code' => $code,
        'total' => $total,
        'orderType' => $orderType
    ]);
}

function handle_order_status() {
    $code = strtoupper(trim($_GET['code'] ?? ''));
    if (!$code) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Missing code.']);
        return;
    }
    $orders = load_orders();
    foreach ($orders as $order) {
        if (strtoupper($order['code']) === $code) {
            echo json_encode(['success' => true, 'order' => $order]);
            return;
        }
    }
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Order not found.']);
}

function load_orders() {
    if (!file_exists(ORDERS_FILE)) {
        return [];
    }
    $contents = file_get_contents(ORDERS_FILE);
    $data = json_decode($contents, true);
    return is_array($data) ? $data : [];
}

function save_orders($orders) {
    // Simple file lock so two near-simultaneous checkouts don't clobber each other.
    $fp = fopen(ORDERS_FILE, 'c+');
    if (flock($fp, LOCK_EX)) {
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($orders, JSON_PRETTY_PRINT));
        fflush($fp);
        flock($fp, LOCK_UN);
    }
    fclose($fp);
}

function generate_unique_code($existingOrders) {
    $existingCodes = array_map(fn($o) => $o['code'], $existingOrders);
    do {
        $code = generate_code();
    } while (in_array($code, $existingCodes, true));
    return $code;
}

// Pattern like "N14L8": Letter, digit, digit, Letter, digit
function generate_code() {
    $letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion with 1/0
    $l1 = $letters[random_int(0, strlen($letters) - 1)];
    $l2 = $letters[random_int(0, strlen($letters) - 1)];
    $d1 = random_int(0, 9);
    $d2 = random_int(0, 9);
    $d3 = random_int(0, 9);
    return "{$l1}{$d1}{$d2}{$l2}{$d3}";
}
