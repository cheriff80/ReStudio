"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

type UseAutoSaveOptions<T> = {
  key: string;
  data: T;
  delay?: number;
};

export function useAutoSave<T>({
  key,
  data,
  delay = 500,
}: UseAutoSaveOptions<T>) {
  const [isLoaded, setIsLoaded] =
    useState(false);

  const [savedData, setSavedData] =
    useState<T | null>(null);

  const [isSaving, setIsSaving] =
    useState(false);

  const [lastSaved, setLastSaved] =
    useState<Date | null>(null);

  const firstSave = useRef(true);

  // ---------------------------------------------
  // CARGAR
  // ---------------------------------------------

  useEffect(() => {
    try {
      const saved =
        localStorage.getItem(key);

      if (saved) {
        const parsed: T =
          JSON.parse(saved);

        setSavedData(parsed);
      }
    } catch (error) {
      console.error(
        "Error al cargar los datos:",
        error
      );
    } finally {
      setIsLoaded(true);
    }
  }, [key]);

  // ---------------------------------------------
  // GUARDAR
  // ---------------------------------------------

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (firstSave.current) {
      firstSave.current = false;
      return;
    }

    setIsSaving(true);

    const timeout = setTimeout(() => {
      try {
        localStorage.setItem(
          key,
          JSON.stringify(data)
        );

        setLastSaved(new Date());
        setIsSaving(false);
      } catch (error) {
        console.error(
          "Error al guardar los datos:",
          error
        );

        setIsSaving(false);
      }
    }, delay);

    return () => {
      clearTimeout(timeout);
    };
  }, [
    data,
    delay,
    isLoaded,
    key,
  ]);

  return {
    isLoaded,
    savedData,
    isSaving,
    lastSaved,
  };
}