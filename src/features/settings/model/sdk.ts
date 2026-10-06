/**
 * Код SDK: как чужой программе работать со строками одной таблицы
 * по API-ключу. Пять действий — список, одна строка, создание, правка,
 * удаление — на трёх языках.
 *
 * Всё, что здесь написано, сверено со шлюзом, а не с документацией:
 *
 * - вход ключом — заголовок `Authorization: API-KEY` и сам ключ
 *   (`app_id`) в `X-API-KEY` (`middleware.go:68`). Проект и окружение
 *   шлюз узнаёт по ключу, передавать их не нужно;
 * - список принимает параметры одним JSON в `?data=` (`items.go:674`);
 * - тело создания и правки — `{"data": {...}}`, id правки — из пути
 *   (`items.go:963`);
 * - удаление ждёт тело, хотя бы пустое: ручка делает `ShouldBindJSON`,
 *   и DELETE без тела получает 400 (`items.go:1479`).
 */
export type SdkLanguage = "js" | "python" | "curl";

export const SDK_LANGUAGES: { id: SdkLanguage; label: string }[] = [
  { id: "js", label: "JavaScript" },
  { id: "python", label: "Python" },
  { id: "curl", label: "cURL" },
];

export function sdkCode(language: SdkLanguage, apiUrl: string, table: string, apiKey: string): string {
  const url = `${apiUrl.replace(/\/$/, "")}/v2/items/${table}`;

  if (language === "js") {
    return `const API_KEY = "${apiKey}";
const BASE_URL = "${url}";

const headers = {
  "Authorization": "API-KEY",
  "X-API-KEY": API_KEY,
  "Content-Type": "application/json",
};

// 1. Get records
async function getRecords(params = { limit: 10, offset: 0 }) {
  const query = encodeURIComponent(JSON.stringify(params));
  const response = await fetch(\`\${BASE_URL}?data=\${query}\`, { headers });
  return response.json();
}

// 2. Get a single record by ID
async function getRecord(id) {
  const response = await fetch(\`\${BASE_URL}/\${id}\`, { headers });
  return response.json();
}

// 3. Create a record
async function createRecord(data) {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ data }),
  });
  return response.json();
}

// 4. Update a record
async function updateRecord(id, data) {
  const response = await fetch(\`\${BASE_URL}/\${id}\`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ data }),
  });
  return response.json();
}

// 5. Delete a record (the body is required, even empty)
async function deleteRecord(id) {
  const response = await fetch(\`\${BASE_URL}/\${id}\`, {
    method: "DELETE",
    headers,
    body: "{}",
  });
  return response.ok;
}`;
  }

  if (language === "python") {
    return `import json
import requests

API_KEY = "${apiKey}"
BASE_URL = "${url}"

headers = {
    "Authorization": "API-KEY",
    "X-API-KEY": API_KEY,
}

# 1. Get records
def get_records(params={"limit": 10, "offset": 0}):
    return requests.get(BASE_URL, headers=headers, params={"data": json.dumps(params)}).json()

# 2. Get a single record by ID
def get_record(id):
    return requests.get(f"{BASE_URL}/{id}", headers=headers).json()

# 3. Create a record
def create_record(data):
    return requests.post(BASE_URL, headers=headers, json={"data": data}).json()

# 4. Update a record
def update_record(id, data):
    return requests.put(f"{BASE_URL}/{id}", headers=headers, json={"data": data}).json()

# 5. Delete a record (the body is required, even empty)
def delete_record(id):
    return requests.delete(f"{BASE_URL}/{id}", headers=headers, json={}).ok`;
  }

  const auth = `  -H "Authorization: API-KEY" \\\n  -H "X-API-KEY: ${apiKey}"`;
  const json = `  -H "Content-Type: application/json"`;

  return `# 1. Get records
curl -G "${url}" \\
${auth} \\
  --data-urlencode 'data={"limit": 10, "offset": 0}'

# 2. Get a single record by ID
curl "${url}/{id}" \\
${auth}

# 3. Create a record
curl -X POST "${url}" \\
${auth} \\
${json} \\
  -d '{"data": {}}'

# 4. Update a record
curl -X PUT "${url}/{id}" \\
${auth} \\
${json} \\
  -d '{"data": {}}'

# 5. Delete a record (the body is required, even empty)
curl -X DELETE "${url}/{id}" \\
${auth} \\
${json} \\
  -d '{}'`;
}
