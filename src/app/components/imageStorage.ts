const DB_NAME = "restudio-db";
const STORE_NAME = "images";
const DB_VERSION = 1;

type StoredImage = {
  id: string;
  name: string;
  blob: Blob;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      DB_NAME,
      DB_VERSION
    );

    request.onupgradeneeded = () => {
      const db = request.result;

      if (
        !db.objectStoreNames.contains(
          STORE_NAME
        )
      ) {
        db.createObjectStore(
          STORE_NAME,
          {
            keyPath: "id",
          }
        );
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// ---------------------------------------------
// GUARDAR IMAGEN
// ---------------------------------------------

export async function saveImage(
  file: File
): Promise<string> {
  const db =
    await openDatabase();

  const id =
    `${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)}`;

  return new Promise(
    (resolve, reject) => {
      const transaction =
        db.transaction(
          STORE_NAME,
          "readwrite"
        );

      const store =
        transaction.objectStore(
          STORE_NAME
        );

      const image: StoredImage = {
        id,
        name: file.name,
        blob: file,
      };

      store.put(image);

      transaction.oncomplete =
        () => {
          db.close();
          resolve(id);
        };

      transaction.onerror = () => {
        db.close();
        reject(
          transaction.error
        );
      };
    }
  );
}

// ---------------------------------------------
// OBTENER IMAGEN
// ---------------------------------------------

export async function getImage(
  id: string
): Promise<string | null> {
  const db =
    await openDatabase();

  return new Promise(
    (resolve, reject) => {
      const transaction =
        db.transaction(
          STORE_NAME,
          "readonly"
        );

      const store =
        transaction.objectStore(
          STORE_NAME
        );

      const request =
        store.get(id);

      request.onsuccess = () => {
        db.close();

        const image =
          request.result as
            | StoredImage
            | undefined;

        if (!image) {
          resolve(null);
          return;
        }

        const url =
          URL.createObjectURL(
            image.blob
          );

        resolve(url);
      };

      request.onerror = () => {
        db.close();
        reject(
          request.error
        );
      };
    }
  );
}

// ---------------------------------------------
// ELIMINAR IMAGEN
// ---------------------------------------------

export async function deleteImage(
  id: string
): Promise<void> {
  const db =
    await openDatabase();

  return new Promise(
    (resolve, reject) => {
      const transaction =
        db.transaction(
          STORE_NAME,
          "readwrite"
        );

      const store =
        transaction.objectStore(
          STORE_NAME
        );

      store.delete(id);

      transaction.oncomplete =
        () => {
          db.close();
          resolve();
        };

      transaction.onerror = () => {
        db.close();
        reject(
          transaction.error
        );
      };
    }
  );
}