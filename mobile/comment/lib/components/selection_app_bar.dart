import 'package:flutter/material.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';
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
                        ? provider.unarchiveSelected()
                        : provider.archiveSelected()
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

  void _showDeleteConfirmation(BuildContext context) {
    final provider = context.read<CardsProvider>();
    final selectedCount = provider.selectedCount;
    final cardWord = selectedCount == 1 ? 'card' : 'cards';

    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        backgroundColor: Colors.transparent,
        elevation: 0,
        insetPadding: const EdgeInsets.symmetric(horizontal: 40),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 300),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              GlassCard(
                useOwnLayer: true,
                quality: GlassQuality.standard,
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 20,
                ),
                child: Text(
                  'Are you sure you want to delete $selectedCount $cardWord?',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: GlassButton.custom(
                      onTap: () => Navigator.of(ctx).pop(),
                      height: 54,
                      useOwnLayer: true,
                      shape: const LiquidRoundedSuperellipse(borderRadius: 20),
                      child: const Text(
                        'Cancel',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: GlassButton.custom(
                      onTap: () {
                        Navigator.of(ctx).pop();
                        provider.deleteSelected();
                      },
                      height: 54,
                      useOwnLayer: true,
                      shape: const LiquidRoundedSuperellipse(borderRadius: 20),
                      glowColor: const Color(0x4DFF0000),
                      child: const Text(
                        'Delete',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                          color: Colors.red,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
