package com.assistant.util;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

public abstract class Repository<K, T> {
    private final Map<K, T> data = new HashMap<>();
    public Optional<T> find(K key) {
        assert key != null;
        return Optional.ofNullable(data.get(key));
    }
    public void add(T obj) {
        assert obj != null;
        K key = extractKey(obj);
        assert key != null;
        data.put(key, obj);
    }
    public void remove(T obj) {
        assert obj != null;
        assert data.containsValue(obj);
        K key = extractKey(obj);
        assert key != null;
        T removed = data.remove(extractKey(obj));
        assert removed == obj;
    }


    protected abstract K extractKey(T obj);
}