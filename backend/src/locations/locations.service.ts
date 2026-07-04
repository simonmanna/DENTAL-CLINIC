import { 
  Injectable, 
  NotFoundException, 
  BadRequestException, 
  ConflictException 
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationTreeDto } from './dto/location-tree.dto';
import { LocationResponseDto } from './dto/location-response.dto';

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateLocationDto): Promise<LocationResponseDto> {
    // Validate parent if provided
    let path = '';
    let level = 0;

    if (dto.parentId) {
      const parent = await this.prisma.location.findUnique({
        where: { id: dto.parentId },
      });

      if (!parent) {
        throw new NotFoundException('Parent location not found');
      }

      path = `${parent.path}${parent.id}/`;
      level = parent.level + 1;
    }

    // If setting as default, unset other defaults of same type
    if (dto.isDefault) {
      await this.prisma.location.updateMany({
        where: { isDefault: true, type: dto.type },
        data: { isDefault: false },
      });
    }

    const location = await this.prisma.location.create({
      data: {
        ...dto,
        path,
        level,
      },
      include: {
        parent: {
          select: { id: true, name: true },
        },
        _count: {
          select: {
            children: true,
            inventoryStocks: true,
            // drugStocks: true,
          },
        },
      },
    });

    return location as unknown as LocationResponseDto;
  }

  async findAll(options: {
    type?: string;
    isActive?: boolean;
    search?: string;
  } = {}): Promise<LocationResponseDto[]> {
    const { type, isActive, search } = options;

    const where: any = {};
    
    if (type) where.type = type;
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }

    const locations = await this.prisma.location.findMany({
      where,
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        parent: {
          select: { id: true, name: true },
        },
        _count: {
          select: {
            children: true,
            inventoryStocks: true,
            // drugStocks: true,
          },
        },
      },
    });

    return locations as unknown as LocationResponseDto[];
  }

  async findTree(): Promise<LocationTreeDto[]> {
    const locations = await this.prisma.location.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            children: true,
            inventoryStocks: true,
            // drugStocks: true,
          },
        },
      },
    });

    return this.buildTree(locations as unknown as LocationTreeDto[]);
  }

  private buildTree(locations: LocationTreeDto[]): LocationTreeDto[] {
    const map = new Map<string, LocationTreeDto>();
    const roots: LocationTreeDto[] = [];

    // First pass: create map
    locations.forEach(loc => {
      map.set(loc.id, { ...loc, children: [] });
    });

    // Second pass: build relationships
    locations.forEach(loc => {
      const node = map.get(loc.id);
      if (!node) return;  // Safety check
      
      if (loc.parentId && map.has(loc.parentId)) {
        const parent = map.get(loc.parentId);
        if (parent) {  // Null check
          parent.children = parent.children || [];
          parent.children.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  async findOne(id: string): Promise<LocationResponseDto> {
    const location = await this.prisma.location.findUnique({
      where: { id },
      include: {
        parent: {
          select: { id: true, name: true },
        },
        children: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            type: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            children: true,
            inventoryStocks: true,
            // drugStocks: true,
            fixedAssets: true,
          },
        },
      },
    });

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    return location as unknown as LocationResponseDto;
  }

  async update(id: string, dto: UpdateLocationDto): Promise<LocationResponseDto> {
    const existing = await this.prisma.location.findUnique({
      where: { id },
      include: {
        children: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Location not found');
    }

    // Check circular reference if parentId is being changed
    if (dto.parentId !== undefined && dto.parentId !== existing.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('Location cannot be its own parent');
      }

      if (dto.parentId) {
        // Check if new parent is not a descendant of current location
        const newParent = await this.prisma.location.findUnique({
          where: { id: dto.parentId },
        });

        if (!newParent) {
          throw new NotFoundException('Parent location not found');
        }

        if (newParent.path.includes(id)) {
          throw new BadRequestException('Cannot move location to its own descendant');
        }

        // Update path and level for this location and all descendants
        const newPath = `${newParent.path}${dto.parentId}/`;
        const newLevel = newParent.level + 1;
        const levelDiff = newLevel - existing.level;

        // Update all descendants' paths and levels
        await this.updateDescendantsPaths(id, newPath, newLevel, levelDiff, existing.path);
      } else {
        // Moving to root level
        await this.updateDescendantsPaths(id, '', 0, -existing.level, existing.path);
      }
    }

    // Handle default flag
    if (dto.isDefault && !existing.isDefault) {
      await this.prisma.location.updateMany({
        where: { 
          isDefault: true, 
          type: dto.type || existing.type,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.location.update({
      where: { id },
      data: dto,
      include: {
        parent: {
          select: { id: true, name: true },
        },
        _count: {
          select: {
            children: true,
            inventoryStocks: true,
            // drugStocks: true,
          },
        },
      },
    });

    return updated as unknown as LocationResponseDto;
  }

  private async updateDescendantsPaths(
    locationId: string, 
    newPath: string, 
    newLevel: number,
    levelDiff: number,
    oldPath: string
  ) {
    // Update the location itself
    await this.prisma.location.update({
      where: { id: locationId },
      data: { path: newPath, level: newLevel },
    });

    // Update all descendants
    const descendants = await this.prisma.location.findMany({
      where: {
        path: { startsWith: `${oldPath}${locationId}/` },
      },
    });

    for (const desc of descendants) {
      const relativePath = desc.path.replace(`${oldPath}${locationId}/`, '');
      const updatedPath = `${newPath}${locationId}/${relativePath}`;
      await this.prisma.location.update({
        where: { id: desc.id },
        data: { 
          path: updatedPath,
          level: desc.level + levelDiff,
        },
      });
    }
  }

  async remove(id: string): Promise<void> {
    const location = await this.prisma.location.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            children: true,
            inventoryStocks: true,
            // drugStocks: true,
            fixedAssets: true,
            stockMovementsFrom: true,
            stockMovementsTo: true,
          },
        },
      },
    });

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    if (location._count.children > 0) {
      throw new ConflictException(
        'Cannot delete location with sub-locations. Please move or delete sub-locations first.'
      );
    }

    if (
      location._count.inventoryStocks > 0 ||
      // location._count.drugStocks > 0 ||
      location._count.fixedAssets > 0
    ) {
      throw new ConflictException(
        'Cannot delete location with associated stock or assets. Please transfer or remove items first.'
      );
    }

    await this.prisma.location.delete({ where: { id } });
  }

  async getBreadcrumbs(id: string): Promise<Array<{ id: string; name: string; type: string }>> {
    const location = await this.prisma.location.findUnique({
      where: { id },
      select: { path: true, id: true, name: true, type: true },
    });

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    const ancestorIds = location.path
      .split('/')
      .filter(Boolean);

    if (ancestorIds.length === 0) {
      return [{ id: location.id, name: location.name, type: location.type }];
    }

    const ancestors = await this.prisma.location.findMany({
      where: { id: { in: ancestorIds } },
      select: { id: true, name: true, type: true },
      orderBy: { level: 'asc' },
    });

    return [...ancestors, { id: location.id, name: location.name, type: location.type }];
  }

  async reorderLocations(updates: Array<{ id: string; parentId?: string; sortOrder: number }>) {
    const transactions = updates.map(update => 
      this.prisma.location.update({
        where: { id: update.id },
        data: { 
          parentId: update.parentId || null,
          sortOrder: update.sortOrder,
        },
      })
    );

    await this.prisma.$transaction(transactions);
  }
}