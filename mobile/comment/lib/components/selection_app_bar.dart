import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:comment/providers.dart';

class SelectionAppBar extends StatefulWidget implements PreferredSizeWidget {
  final bool isArchivedScreen;

  const SelectionAppBar({super.key, this.isArchivedScreen = false});

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  State<SelectionAppBar> createState() => _SelectionAppBarState();
}

class _SelectionAppBarState extends State<SelectionAppBar>
    with SingleTickerProviderStateMixin {
  late final AnimationController _slideController;
  late final Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _slideController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 220),
    );
    _slideAnimation =
        Tween<Offset>(begin: const Offset(0, -1), end: Offset.zero).animate(
          CurvedAnimation(parent: _slideController, curve: Curves.easeOutCubic),
        );
    _slideController.forward();
  }

  @override
  void dispose() {
    _slideController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.read<CardsProvider>();
    final selectedCount = context.select<CardsProvider, int>(
      (cardsProvider) => cardsProvider.selectedCount,
    );

    return ClipRect(
      child: SlideTransition(
        position: _slideAnimation,
        child: AppBar(
          automaticallyImplyLeading: false,
          leading: IconButton(
            icon: const Icon(Icons.close),
            onPressed: () => provider.exitSelectionMode(),
            tooltip: 'Cancel',
          ),
          titleSpacing: 0,
          title: Text(
            '$selectedCount selected',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w500),
          ),
          actions: [
            IconButton(
              icon: Icon(
                widget.isArchivedScreen
                    ? Icons.unarchive_outlined
                    : Icons.archive_outlined,
              ),
              onPressed: selectedCount > 0
                  ? () => widget.isArchivedScreen
                        ? _showUnarchiveConfirmation(context)
                        : _showArchiveConfirmation(context)
                  : null,
              tooltip: widget.isArchivedScreen ? 'Unarchive' : 'Archive',
            ),
            IconButton(
              icon: Icon(
                Icons.delete,
                color: selectedCount > 0 ? Colors.redAccent : Colors.white24,
              ),
              onPressed: selectedCount > 0
                  ? () => _showDeleteConfirmation(context)
                  : null,
              tooltip: 'Delete',
            ),
          ],
        ),
      ),
    );
  }

  void _showArchiveConfirmation(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Archive Cards'),
        content: Text(
          'Are you sure you want to archive ${context.read<CardsProvider>().selectedCount} card(s)?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              context.read<CardsProvider>().archiveSelected();
            },
            child: const Text('Archive'),
          ),
        ],
      ),
    );
  }

  void _showUnarchiveConfirmation(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Unarchive Cards'),
        content: Text(
          'Are you sure you want to unarchive ${context.read<CardsProvider>().selectedCount} card(s)?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              context.read<CardsProvider>().unarchiveSelected();
            },
            child: const Text('Unarchive'),
          ),
        ],
      ),
    );
  }

  void _showDeleteConfirmation(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Cards'),
        content: Text(
          'Are you sure you want to delete ${context.read<CardsProvider>().selectedCount} card(s)? This action cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              context.read<CardsProvider>().deleteSelected();
            },
            style: TextButton.styleFrom(foregroundColor: Colors.redAccent),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }
}
