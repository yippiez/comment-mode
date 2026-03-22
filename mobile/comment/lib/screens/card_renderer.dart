import 'package:comment/models/card_colors.dart';
import 'package:comment/components/confirmation_dialog.dart';
import 'package:comment/providers.dart';
import 'package:comment/shared/card_color_palette.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

class CardRendererScreen extends StatelessWidget {
  final String cardId;

  const CardRendererScreen({super.key, required this.cardId});

  @override
  Widget build(BuildContext context) {
    final card = context.select<CardsProvider, CardData?>(
      (provider) => provider.getCardById(cardId),
    );
    final rendererBackground =
        card?.color.backgroundColor ??
        Theme.of(context).scaffoldBackgroundColor;
    final rendererForeground =
        card?.color.foregroundColor ?? Theme.of(context).colorScheme.onSurface;

    return Scaffold(
      backgroundColor: rendererBackground,
      appBar: AppBar(
        backgroundColor: rendererBackground,
        foregroundColor: rendererForeground,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Text(card?.title ?? 'Card'),
        actions: [
          IconButton(
            icon: const Icon(Icons.palette_outlined),
            tooltip: 'Card colors',
            onPressed: card == null
                ? null
                : () => _showColorPalette(context, card),
          ),
          IconButton(
            icon: Icon(
              card?.isArchived == true
                  ? Icons.unarchive_outlined
                  : Icons.archive_outlined,
            ),
            tooltip: card?.isArchived == true ? 'Unarchive' : 'Archive',
            onPressed: card == null
                ? null
                : () => _toggleArchive(context, card),
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
            tooltip: 'Delete card',
            onPressed: card == null
                ? null
                : () => _confirmDelete(context, card),
          ),
        ],
      ),
      body: const SizedBox.expand(),
    );
  }

  void _toggleArchive(BuildContext context, CardData card) {
    context.read<CardsProvider>().setCardArchived(card.id, !card.isArchived);
    Navigator.of(context).maybePop();
  }

  void _confirmDelete(BuildContext context, CardData card) {
    showGlassConfirmationDialog(
      context,
      title: 'Delete ${card.title}?',
      description: 'This card will be permanently deleted.',
      confirmLabel: 'Delete',
      confirmTextColor: Colors.red,
      confirmGlowColor: const Color(0x4DFF0000),
      onConfirm: () {
        context.read<CardsProvider>().deleteCards([card.id]);
        Navigator.of(context).maybePop();
      },
    );
  }

  void _showColorPalette(BuildContext context, CardData card) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) {
        return SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              for (final color in CardColors.values)
                ListTile(
                  leading: _PaletteColorCircle(color: color.backgroundColor),
                  title: Text(color.label),
                  trailing: color == card.color
                      ? const Icon(Icons.check, color: Colors.white)
                      : null,
                  onTap: () {
                    sheetContext.read<CardsProvider>().setCardColor(
                      card.id,
                      color,
                    );
                    Navigator.of(sheetContext).pop();
                  },
                ),
            ],
          ),
        );
      },
    );
  }
}

class _PaletteColorCircle extends StatelessWidget {
  final Color color;

  const _PaletteColorCircle({required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 2),
      ),
      padding: const EdgeInsets.all(2),
      child: DecoratedBox(
        decoration: BoxDecoration(shape: BoxShape.circle, color: color),
      ),
    );
  }
}
