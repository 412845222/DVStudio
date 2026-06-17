import os

def count_lines(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return sum(1 for line in f)
    except:
        return 0

def find_large_files(root_dir, min_lines=500):
    large_files = []
    for dirpath, dirnames, filenames in os.walk(root_dir):
        for filename in filenames:
            if filename.endswith(('.vue', '.ts', '.py')):
                filepath = os.path.join(dirpath, filename)
                lines = count_lines(filepath)
                if lines >= min_lines:
                    large_files.append((filepath, lines))
    return sorted(large_files, key=lambda x: -x[1])

if __name__ == '__main__':
    src_dir = r'g:\DwebStudio\DwebVideoStudio\dweb-video-studio\src'
    django_dir = r'g:\DwebStudio\DwebVideoStudio\dweb-video-studio\django-app'
    
    print('Scanning src directory...')
    src_files = find_large_files(src_dir, 800)
    print('Scanning django-app directory...')
    django_files = find_large_files(django_dir, 800)
    
    all_files = src_files + django_files
    all_files.sort(key=lambda x: -x[1])
    
    print('\nLarge files (>= 800 lines):')
    print('=' * 80)
    for filepath, lines in all_files:
        print(f'{lines:6d} lines - {filepath}')
