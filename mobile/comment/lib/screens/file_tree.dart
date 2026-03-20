import 'package:flutter/material.dart';

class FileTreeScreen extends StatefulWidget {
  const FileTreeScreen({super.key});

  @override
  State<FileTreeScreen> createState() => _FileTreeScreenState();
}

class _FileTreeScreenState extends State<FileTreeScreen> {
  final List<FileItem> _files = [
    FileItem(
      name: 'lib',
      isFolder: true,
      children: [
        FileItem(name: 'main.dart', isFolder: false),
        FileItem(
          name: 'screens',
          isFolder: true,
          children: [
            FileItem(name: 'code_view.dart', isFolder: false),
            FileItem(name: 'file_tree.dart', isFolder: false),
            FileItem(name: 'settings.dart', isFolder: false),
            FileItem(name: 'ssh_connection.dart', isFolder: false),
          ],
        ),
        FileItem(
          name: 'shared',
          isFolder: true,
          children: [FileItem(name: 'theme.dart', isFolder: false)],
        ),
      ],
    ),
    FileItem(name: 'pubspec.yaml', isFolder: false),
    FileItem(name: 'README.md', isFolder: false),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('File Tree')),
      body: ListView.builder(
        itemCount: _files.length,
        itemBuilder: (context, index) {
          return _buildFileTile(_files[index], 0);
        },
      ),
    );
  }

  Widget _buildFileTile(FileItem item, int depth) {
    return Column(
      children: [
        InkWell(
          onTap: () {
            if (item.isFolder) {
              setState(() {
                item.isExpanded = !item.isExpanded;
              });
            }
          },
          child: Padding(
            padding: EdgeInsets.only(
              left: depth * 16.0 + 8,
              right: 8,
              top: 4,
              bottom: 4,
            ),
            child: Row(
              children: [
                Icon(
                  item.isFolder
                      ? (item.isExpanded ? Icons.folder_open : Icons.folder)
                      : Icons.insert_drive_file,
                  color: item.isFolder ? Colors.amber : Colors.blue,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Text(item.name),
              ],
            ),
          ),
        ),
        if (item.isFolder && item.isExpanded && item.children != null)
          ...item.children!.map((child) => _buildFileTile(child, depth + 1)),
      ],
    );
  }
}

class FileItem {
  final String name;
  final bool isFolder;
  final List<FileItem>? children;
  bool isExpanded;

  FileItem({
    required this.name,
    required this.isFolder,
    this.children,
    this.isExpanded = false,
  });
}
