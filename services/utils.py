# services/utils.py
import hashlib
import os

def calculate_file_hash(file_path):
    """Calcula SHA-256 do conteúdo de um arquivo"""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def calculate_bytes_hash(data):
    """Calcula SHA-256 de bytes"""
    return hashlib.sha256(data).hexdigest()
